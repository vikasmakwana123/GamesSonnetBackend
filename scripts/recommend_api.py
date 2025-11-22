# scripts/recommend_api.py
import sys, json
from recommend import recommend

def main():
    raw = sys.stdin.read()
    params = json.loads(raw or "{}")
    genre = params.get("genre", "")
    platform = params.get("platform", "")
    topK = int(params.get("topK", 20))
    alpha = float(params.get("alpha", 0.8))
    recs = recommend(genre, platform, topK, alpha)
    print(json.dumps(recs))

if __name__ == "__main__":
    main()
