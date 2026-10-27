"""Actual pinned AI4Bharat inference. No cloud fallback or example outputs."""
import json
import os
import re
import time
from pathlib import Path

MANIFEST = json.loads(Path(__file__).with_name("manifest.json").read_text())
LANGUAGES = {
    "en": "eng_Latn", "hi": "hin_Deva", "mr": "mar_Deva", "as": "asm_Beng",
    "bn": "ben_Beng", "brx": "brx_Deva", "doi": "doi_Deva", "gu": "guj_Gujr",
    "kn": "kan_Knda", "ks": "kas_Arab", "kok": "kok_Deva", "mai": "mai_Deva",
    "ml": "mal_Mlym", "mni": "mni_Mtei", "ne": "npi_Deva", "or": "ory_Orya",
    "pa": "pan_Guru", "sa": "san_Deva", "sat": "sat_Olck", "sd": "snd_Arab",
    "ta": "tam_Taml", "te": "tel_Telu", "ur": "urd_Arab",
}


class TranslationFailure(Exception):
    def __init__(self, code, status=422):
        super().__init__(code)
        self.code, self.status = code, status


def language_code(code):
    if code in LANGUAGES:
        return LANGUAGES[code]
    if code in LANGUAGES.values() or code in {"kas_Deva", "snd_Deva", "mni_Beng"}:
        return code
    raise TranslationFailure("UNSUPPORTED_LANGUAGE")


class IndicEngine:
    def __init__(self):
        self.models = {}
        self.detector = None
        self.error = "MODEL_NOT_PREPARED"
        self.successful_inferences = 0
        self.stage = 'IDLE'

    def detect(self, text):
        from lingua import LanguageDetectorBuilder
        if self.detector is None:
            self.detector = LanguageDetectorBuilder.from_all_languages().with_minimum_relative_distance(0.15).build()
        selected = self.detector.detect_language_of(text)
        if selected is None:
            raise TranslationFailure("MANUAL_LANGUAGE_REQUIRED")
        code = selected.iso_code_639_1.name.lower()
        if code not in LANGUAGES:
            raise TranslationFailure("MANUAL_LANGUAGE_REQUIRED")
        return code

    def load(self, direction):
        if direction in self.models:
            return self.models[direction]
        try:
            # Only one direction is resident on this development CPU service.
            # A single inference worker makes unloading the other model safe.
            import gc
            self.models.clear()
            gc.collect()
            import torch
            torch.set_num_threads(max(1, min(8, int(os.getenv("SYNAPSE_TRANSLATION_THREADS", "4")))))
            from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
            from IndicTransToolkit import IndicProcessor
            spec = MANIFEST[direction]
            options = {"revision": spec["revision"], "code_revision": spec["revision"],
                       "trust_remote_code": True, "local_files_only": True}
            self.stage='LOADING_TOKENIZER'
            tokenizer = AutoTokenizer.from_pretrained(spec["id"], **options)
            if tokenizer.src_spm.get_piece_size() == 0 or tokenizer.tgt_spm.get_piece_size() == 0:
                raise TranslationFailure('MODEL_TOKENIZER_INCOMPLETE', 503)
            self.stage='LOADING_MODEL'
            model = AutoModelForSeq2SeqLM.from_pretrained(
                spec["id"], **options, use_safetensors=True, torch_dtype=torch.float32,
                attn_implementation="eager").to("cpu").eval()
            self.models[direction] = (tokenizer, model, IndicProcessor(inference=True))
            self.error = None
            return self.models[direction]
        except Exception:
            self.error = "MODEL_LOADING_FAILED"
            raise TranslationFailure(self.error, 503) from None

    def translate(self, subject, body, source="auto", target="en"):
        detected = source in {"auto", "und"}
        source = self.detect(body) if detected else source
        src, tgt = language_code(source), language_code(target)
        if src == tgt:
            return {"subject": subject, "body": body, "sourceLanguage": source,
                    "targetLanguage": target, "inferenceExecuted": False,
                    "provider": "Lingua (translation not required)", "version": "lingua-language-detector/2.2.0",
                    "detector": "lingua/2.2.0" if detected else "manual", "reviewStatus": "NOT_REQUIRED"}
        if src != "eng_Latn" and tgt != "eng_Latn":
            raise TranslationFailure("ENGLISH_DIRECTION_REQUIRED")
        direction = "en_indic" if src == "eng_Latn" else "indic_en"
        tokenizer, model, processor = self.load(direction)
        import torch
        from transformers import StoppingCriteria, StoppingCriteriaList
        deadline = time.monotonic() + min(180, max(5, int(os.getenv("SYNAPSE_TRANSLATION_TIMEOUT_SECONDS", "120"))))

        class Deadline(StoppingCriteria):
            def __call__(self, input_ids, scores, **kwargs):
                return time.monotonic() >= deadline

        def pre(text):
            return processor.preprocess_batch([text], src_lang=src, tgt_lang=tgt, visualize=False)

        def chunks(text):
            # Account for tokenizer/script normalization; never silently truncate.
            output = []
            for sentence in re.split(r"(?<=[.!?।])\s+|\n+", text):
                pending = ""
                for word in sentence.split():
                    candidate = (pending + " " + word).strip()
                    if len(tokenizer(pre(candidate), truncation=False)["input_ids"][0]) > 256:
                        if not pending:
                            raise TranslationFailure("INPUT_SEGMENT_TOO_LONG")
                        output.append(pending)
                        pending = word
                        if len(tokenizer(pre(pending), truncation=False)["input_ids"][0]) > 256:
                            raise TranslationFailure("INPUT_SEGMENT_TOO_LONG")
                    else:
                        pending = candidate
                if pending:
                    output.append(pending)
            return output

        def infer(text):
            if not text.strip():
                return ""
            translated = []
            for chunk in chunks(text):
                if time.monotonic() >= deadline:
                    raise TranslationFailure("INFERENCE_TIMEOUT", 504)
                self.stage='GENERATING'
                inputs = tokenizer(pre(chunk), padding=True, truncation=False, return_tensors="pt")
                with torch.inference_mode():
                    output = model.generate(**inputs, use_cache=True, num_beams=1, max_new_tokens=256,
                                            stopping_criteria=StoppingCriteriaList([Deadline()]))
                if time.monotonic() >= deadline:
                    raise TranslationFailure("INFERENCE_TIMEOUT", 504)
                if output[0][-1].item() != tokenizer.eos_token_id:
                    raise TranslationFailure("OUTPUT_LIMIT_REVIEW_REQUIRED")
                decoded = tokenizer.batch_decode(output, skip_special_tokens=True, clean_up_tokenization_spaces=True)
                translated.extend(processor.postprocess_batch(decoded, lang=tgt))
            return "\n".join(translated)

        result_subject, result_body = infer(subject), infer(body)
        if not result_body.strip():
            raise TranslationFailure("EMPTY_MODEL_OUTPUT", 503)
        spec = MANIFEST[direction]
        self.successful_inferences += 1
        self.stage='IDLE'
        return {"subject": result_subject, "body": result_body, "sourceLanguage": source,
                "targetLanguage": target, "modelId": spec["id"], "modelRevision": spec["revision"],
                "provider": "AI4Bharat IndicTrans2", "version": spec["id"] + "@" + spec["revision"],
                "detector": "lingua/2.2.0" if detected else "manual", "inferenceExecuted": True,
                "reviewStatus": "NEEDS_REVIEW"}
