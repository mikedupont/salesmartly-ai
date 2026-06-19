#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import io
import json
import tarfile
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SOURCE_URL = "https://dl.fbaipublicfiles.com/parlai/empatheticdialogues/empatheticdialogues.tar.gz"
SYSTEM_PROMPT = "You are Mia, a warm private-chat companion designed for natural, long-term conversations."


def clean(text: object) -> str:
    value = str(text or "")
    value = value.replace("_comma_", ",")
    value = value.replace("_period_", ".")
    value = value.replace("_question_", "?")
    value = value.replace("_exclamation_", "!")
    value = value.replace("_apos_", "'")
    return " ".join(value.split()).strip()


def to_jsonl(rows: list[dict]) -> str:
    return "\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + ("\n" if rows else "")


def build_record(row: dict, split: str, index: int) -> dict:
    prompt = clean(row.get("prompt"))
    utterance = clean(row.get("utterance"))
    conv_id = clean(row.get("conv_id"))
    context = clean(row.get("context"))
    selfeval = clean(row.get("selfeval"))
    tags = clean(row.get("tags"))

    return {
        "id": f"ed_{split}_{conv_id}_{int(row.get('utterance_idx') or index)}",
        "type": "sft",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": utterance},
        ],
        "metadata": {
            "schema_version": "training_v1",
            "source_kind": "empathetic_dialogues",
            "public_sources": ["EmpatheticDialogues"],
            "sample_stage": "seed",
            "sample_intent": "support",
            "dataset_split": split,
            "context": context,
            "conversation_id": conv_id,
            "utterance_idx": int(row.get("utterance_idx") or index),
            "speaker_idx": int(row.get("speaker_idx") or 0),
            "selfeval": selfeval,
            "tags": tags,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate EmpatheticDialogues seed JSONL")
    parser.add_argument("--limit", type=int, default=0, help="Optional max rows per split for smoke testing")
    parser.add_argument("--output", default=str(DATA_DIR / "empathetic_dialogues_seed_sft.jsonl"))
    args = parser.parse_args()

    with urllib.request.urlopen(SOURCE_URL) as response:
      archive_bytes = response.read()

    split_files = {
        "train": "empatheticdialogues/train.csv",
        "validation": "empatheticdialogues/valid.csv",
        "test": "empatheticdialogues/test.csv",
    }

    rows: list[dict] = []
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as archive:
        members = {member.name: member for member in archive.getmembers() if member.isfile()}
        for split, split_file in split_files.items():
            member = members.get(split_file)
            if member is None:
                raise RuntimeError(f"Missing {split_file} in archive")

            extracted = archive.extractfile(member)
            if extracted is None:
                raise RuntimeError(f"Could not extract {split_file}")

            reader = csv.DictReader(io.TextIOWrapper(extracted, encoding="utf-8"))
            for index, row in enumerate(reader, start=1):
                rows.append(build_record(row, split, index))
                if args.limit and index >= args.limit:
                    break

    output_text = to_jsonl(rows)
    if args.output == "-":
        import sys

        sys.stdout.write(output_text)
        print(json.dumps({"ok": True, "rows": len(rows), "output": "stdout"}, indent=2), file=sys.stderr)
        return

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(output_text, encoding="utf-8")
    print(json.dumps({"ok": True, "rows": len(rows), "output": str(output_path)}, indent=2))


if __name__ == "__main__":
    main()
