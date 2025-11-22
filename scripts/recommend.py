# scripts/recommend.py
import pandas as pd
import numpy as np
import joblib
from sklearn.metrics.pairwise import cosine_similarity
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
VECTORIZER_PKL = BASE_DIR / "artifacts" / "vectorizer.pkl"
MATRIX_NPZ = BASE_DIR / "artifacts" / "game_matrix.npz"
INDEX_CSV = BASE_DIR / "artifacts" / "game_index.csv"

def recommend(selected_genre: str, selected_platform: str, top_k: int = 20, alpha: float = 0.8):
    df = pd.read_csv(INDEX_CSV)
    vectorizer = joblib.load(VECTORIZER_PKL)
    # Load the saved matrix robustly. allow_pickle=True is required when saving scipy sparse objects.
    with np.load(MATRIX_NPZ, allow_pickle=True) as npz:
        if "X" in npz:
            X = npz["X"].item()
        elif "arr_0" in npz:
            X = npz["arr_0"].item() if npz["arr_0"].dtype == object else npz["arr_0"]
        else:
            # fallback: try loading as array
            X = npz[list(npz.files)[0]]
    # Build preference query
    tokens = []
    if selected_genre: tokens.append(selected_genre.replace(" ", "_").lower())
    if selected_platform: tokens.append(selected_platform.replace(" ", "_").lower())
    query = " ".join(tokens)
    q_vec = vectorizer.transform([query])
    sim = cosine_similarity(q_vec, X).ravel()

    # Normalize rating to [0,1]
    rating = df["rating"].fillna(0).to_numpy()
    if rating.max() > 0:
        rating_norm = rating / rating.max()
    else:
        rating_norm = rating

    # Blend similarity with rating
    score = alpha * sim + (1 - alpha) * rating_norm

    top_idx = np.argsort(-score)[:top_k]
    results = df.iloc[top_idx][["name","image","rating","genres","platforms"]].copy()
    results["score"] = score[top_idx]
    return results.to_dict(orient="records")

if __name__ == "__main__":
    # quick test
    recs = recommend("Action", "PC", top_k=10, alpha=0.8)
    for r in recs:
        print(r["name"], r["rating"], r["score"])
