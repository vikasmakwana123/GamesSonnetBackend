# scripts/recommend_personalized.py
import sys
import json
import pandas as pd
import numpy as np
from recommend import recommend
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
INDEX_CSV = BASE_DIR / "artifacts" / "game_index.csv"

def recommend_by_preferences(liked_game_ids, top_k=15):
    """
    Recommend games based on user-liked games.
    Extract genres and platforms from liked games, then use them for recommendations.
    """
    try:
        df = pd.read_csv(INDEX_CSV)
        
        # Convert liked_game_ids to strings for name matching
        liked_names = [str(g).lower() for g in liked_game_ids]
        
        # Match by game name (case-insensitive)
        liked_games = df[df['name'].str.lower().isin(liked_names)].copy()
        
        if liked_games.empty:
            return []
        
        # Extract genres and platforms from liked games
        all_genres = set()
        all_platforms = set()
        
        for _, game in liked_games.iterrows():
            if isinstance(game['genres'], str) and game['genres']:
                genres = game['genres'].split(',')
                all_genres.update([g.strip() for g in genres])
            
            if isinstance(game['platforms'], str) and game['platforms']:
                platforms = game['platforms'].split(',')
                all_platforms.update([p.strip() for p in platforms])
        
        # If we have genres and platforms, use the first ones to filter
        genre = list(all_genres)[0] if all_genres else ""
        platform = list(all_platforms)[0] if all_platforms else ""
        
        # Get recommendations
        recommendations = recommend(genre, platform, top_k=top_k * 2, alpha=0.7)
        
        # Filter out already liked games
        liked_game_names = set(liked_games['name'].str.lower())
        filtered_recs = [
            game for game in recommendations 
            if game.get('name', '').lower() not in liked_game_names
        ][:top_k]
        
        return filtered_recs
    
    except Exception as e:
        print(f"Error in recommend_by_preferences: {str(e)}", file=sys.stderr)
        return []

def main():
    try:
        raw = sys.stdin.read()
        params = json.loads(raw or "{}")
        liked_ids = params.get("likedGameIds", [])
        top_k = int(params.get("topK", 15))
        
        if not liked_ids:
            print(json.dumps([]))
            return
        
        recs = recommend_by_preferences(liked_ids, top_k)
        print(json.dumps(recs))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
