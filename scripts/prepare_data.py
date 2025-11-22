# scripts/prepare_data.py
import json
import pandas as pd
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
INPUT_JSON = BASE_DIR / "data" / "allGames.json"
OUTPUT_CSV = BASE_DIR / "data" / "games_clean.csv"

def safe_list(items, key=None):
    if not items: return []
    if key:
        return [x.get(key, "") for x in items if isinstance(x, dict)]
    return [str(x) for x in items]

def extract_platforms(p):
    if not p: return []
    return [x.get("platform", {}).get("name", "") for x in p if isinstance(x, dict)]

def main():
    with INPUT_JSON.open("r", encoding="utf-8") as f:
        raw = json.load(f)

    rows = []
    for g in raw:
        name = g.get("name", "").strip()
        image = g.get("background_image", "")
        rating = g.get("rating", 0.0)
        ratings_count = g.get("ratings_count", 0)
        genres = safe_list(g.get("genres", []), "name")
        platforms = extract_platforms(g.get("platforms", []))
        tags = safe_list(g.get("tags", []), "name")

        # Build a feature string (content-based)
        feature_tokens = genres + platforms + tags
        feature_str = " ".join(t.replace(" ", "_").lower() for t in feature_tokens)

        rows.append({
            "name": name,
            "image": image,
            "rating": rating,
            "ratings_count": ratings_count,
            "genres": "|".join(genres),
            "platforms": "|".join(platforms),
            "tags": "|".join(tags),
            "features": feature_str
        })

    df = pd.DataFrame(rows).dropna(subset=["name"]).drop_duplicates(subset=["name"])
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"Saved {len(df)} rows to {OUTPUT_CSV}")

if __name__ == "__main__":
    main()
