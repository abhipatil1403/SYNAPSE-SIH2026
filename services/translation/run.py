"""Run from repository root, with worker/service-only private environment."""
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(".env.translation.local")
os.environ.setdefault("HF_HOME", str(Path.home() / ".cache/synapse-it2/huggingface"))
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ.setdefault('OMP_NUM_THREADS', '4')
os.environ.setdefault('MKL_NUM_THREADS', '4')
logging.getLogger('huggingface_hub').setLevel(logging.CRITICAL)


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare", action="store_true")
    args = parser.parse_args()
    if args.prepare:
        from .prepare import main as prepare
        prepare()
    else:
        # Serving is offline. The download credential is unnecessary after
        # preparation and is never available to inference/provider requests.
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ.pop('HF_TOKEN', None)
        import uvicorn
        from .app import create_app
        uvicorn.run(create_app(), host="127.0.0.1", port=8001, access_log=False, log_level="warning")


if __name__ == "__main__":
    main()
