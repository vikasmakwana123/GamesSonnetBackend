# scripts/train_model.py
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import joblib

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_CSV = BASE_DIR / "data" / "games_clean.csv"
VECTORIZER_PKL = BASE_DIR / "artifacts" / "vectorizer.pkl"
MATRIX_NPZ = BASE_DIR / "artifacts" / "game_matrix.npz"
INDEX_CSV = BASE_DIR / "artifacts" / "game_index.csv"

VECTORIZER_MAX_FEATURES = 5000

def main():
    df = pd.read_csv(DATA_CSV)
    df = df.fillna("")
    features = df["features"].astype(str)

    vectorizer = TfidfVectorizer(max_features=VECTORIZER_MAX_FEATURES)
    X = vectorizer.fit_transform(features)

    # Save artifacts
    VECTORIZER_PKL.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(vectorizer, VECTORIZER_PKL)
    np.savez_compressed(MATRIX_NPZ, X=X)
    df[["name","image","rating","ratings_count","genres","platforms"]].to_csv(INDEX_CSV, index=False)

    print(f"Artifacts saved: {VECTORIZER_PKL}, {MATRIX_NPZ}, {INDEX_CSV}, shape={X.shape}")

if __name__ == "__main__":
    main()
