
import axios from "axios";
import fs from "fs";

const API_KEY = "9030709abcec4c239d8e479434b76ea5"; // Replace with your RAWG API key
const BASE_URL = "https://api.rawg.io/api/games";
const PAGE_SIZE = 40; // Max allowed per request

async function fetchGamesFromPage(startPage = 6, maxPages = 10) {
  let allGames = [];

  try {
    // Load existing file if it exists
    let existingGames = [];
    if (fs.existsSync("allGames.json")) {
      const fileData = fs.readFileSync("allGames.json", "utf-8");
      existingGames = JSON.parse(fileData);
    }

    for (let page = startPage; page <= maxPages; page++) {
      const url = `${BASE_URL}?key=${API_KEY}&page=${page}&page_size=${PAGE_SIZE}`;
      console.log(`📥 Fetching page ${page}...`);

      const response = await axios.get(url);
      const games = response.data.results;

      allGames = allGames.concat(games);

      // Stop if no more results
      if (!response.data.next) break;
    }

    // Merge new games with existing ones
    const updatedGames = existingGames.concat(allGames);

    // Save back to JSON file
    fs.writeFileSync("allGames.json", JSON.stringify(updatedGames, null, 2));
    console.log(`✅ Added ${allGames.length} new games. Total now: ${updatedGames.length}`);
  } catch (error) {
    console.error("❌ Error fetching games:", error.message);
  }
}

// Example: fetch pages 6–10
fetchGamesFromPage(41, 60);
