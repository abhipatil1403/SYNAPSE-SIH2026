"""Owner-authorized model download after gated HF terms/access approval."""
from huggingface_hub import snapshot_download
from .engine import MANIFEST


def main():
    for direction, spec in MANIFEST.items():
        try:
            snapshot_download(spec["id"], revision=spec["revision"],
                              allow_patterns=["*.json", "*.py", "*.safetensors", "*.model", "*.txt", "*.vocab", "model.SRC", "model.TGT"],
                              ignore_patterns=["*.bin"], max_workers=4)
            print("PASS prepared official pinned checkpoint:", direction, flush=True)
        except Exception:
            print("BLOCKED model download/access failed:", direction, "(no token or provider response logged)", flush=True)
            raise SystemExit(1) from None


if __name__ == "__main__":
    main()
