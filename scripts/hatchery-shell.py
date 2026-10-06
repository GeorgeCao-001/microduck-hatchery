"""Run the isolated development sample without importing board-side modules."""

from pathlib import Path
import sys


SAMPLE_ROOT = Path(__file__).resolve().parents[1] / "tools" / "hatchery-shell"
sys.path.insert(0, str(SAMPLE_ROOT))

from device.__main__ import main


if __name__ == "__main__":
    main()
