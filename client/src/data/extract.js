import fs from "fs/promises";

const BASE_URL = "https://api.jikan.moe/v4";
const DELAY = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Calcul de la distance de Levenshtein pour fuzzy matching
function levenshtein(a, b) {
  const matrix = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// Calcul du score de similarité (0 = identique, 1 = complètement différent)
function similarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  return levenshtein(longer, shorter) / longer.length;
}

// Normalisation des titres pour améliorer le matching
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[:\-–—]/g, " ") // remplace ponctuation par espace
    .replace(/\s+/g, " ") // normalise espaces multiples
    .replace(/\b(season|part|cour|2nd|3rd|movie|ova|special|final|the final|specials|gekijouban)\b\s*\d*/gi, "") // retire saisons/parties/finales
    .replace(/\d+(st|nd|rd|th)?/g, "") // retire chiffres avec suffixes ordinaux
    .replace(/[()[\]]/g, "") // retire parenthèses et crochets
    .replace(/\s+/g, " ") // normalise espaces multiples
    .trim();
}

// Regroupement des animes similaires
function groupSimilarAnimes(animeList, threshold = 0.5) {
  const groups = [];
  const processed = new Set();
  
  for (let i = 0; i < animeList.length; i++) {
    if (processed.has(i)) continue;
    
    const group = {
      canonical_title: animeList[i].anime_title,
      anime_ids: [animeList[i].anime_id],
      anime_titles: [animeList[i].anime_title],
      characters: new Map() // utilise Map pour dédupliquer par ID
    };
    
    const normalized_i = normalizeTitle(animeList[i].anime_title);
    
    // Ajouter les personnages du premier anime
    for (const char of animeList[i].characters) {
      group.characters.set(char.id, char);
    }
    
    processed.add(i);
    
    // Chercher les animes similaires
    for (let j = i + 1; j < animeList.length; j++) {
      if (processed.has(j)) continue;
      
      const normalized_j = normalizeTitle(animeList[j].anime_title);
      const score = similarity(normalized_i, normalized_j);
      
      if (score <= threshold) {
        group.anime_ids.push(animeList[j].anime_id);
        group.anime_titles.push(animeList[j].anime_title);
        
        // Fusionner les personnages (dédupliqués par ID)
        for (const char of animeList[j].characters) {
          if (!group.characters.has(char.id)) {
            group.characters.set(char.id, char);
          }
        }
        
        processed.add(j);
      }
    }
    
    // Convertir Map en array
    group.characters = Array.from(group.characters.values());
    groups.push(group);
  }
  
  return groups;
}

async function main() {
  const TOTAL_ANIME = 200; // Modifie cette valeur (25, 50, 75, 100, etc.)
  const PER_PAGE = 25; // API limit par page
  const totalPages = Math.ceil(TOTAL_ANIME / PER_PAGE);
  
  console.log(`Fetching top ${TOTAL_ANIME} anime (${totalPages} pages)...`);
  
  const allData = [];
  let animeList = [];
  
  // Récupérer tous les animes avec pagination
  for (let page = 1; page <= totalPages; page++) {
    console.log(`\nFetching page ${page}/${totalPages}...`);
    const topRes = await fetch(`${BASE_URL}/top/anime?limit=${PER_PAGE}&page=${page}`);
    const topData = await topRes.json();
    animeList.push(...topData.data);
    
    if (page < totalPages) {
      await sleep(DELAY);
    }
  }
  
  // Limiter au nombre exact demandé
  animeList = animeList.slice(0, TOTAL_ANIME);
  console.log(`\n✓ ${animeList.length} animes récupérés\n`);
  
  for (const anime of animeList) {
    console.log(`[${allData.length + 1}/${animeList.length}] Fetching characters for: ${anime.title}`);
    
    try {
      const charRes = await fetch(`${BASE_URL}/anime/${anime.mal_id}/characters`);
      const charData = await charRes.json();
      
      allData.push({
        anime_id: anime.mal_id,
        anime_title: anime.title,
        characters: charData.data.map((c) => ({
          id: c.character.mal_id,
          name: c.character.name,
          role: c.role,
          image: c.character.images?.jpg?.image_url,
        })),
      });
      
      await sleep(DELAY);
    } catch (error) {
      console.error(`Error fetching ${anime.title}:`, error.message);
    }
  }
  
  // Sauvegarder les données brutes
  await fs.writeFile("characters_raw.json", JSON.stringify(allData, null, 2));
  console.log("\n✓ Données brutes sauvegardées dans characters_raw.json");
  
  // Regrouper les animes similaires
  console.log("\nRegroupement des animes similaires...");
  const grouped = groupSimilarAnimes(allData);
  
  // Afficher les regroupements
  console.log("\n=== REGROUPEMENTS DÉTECTÉS ===");
  grouped.forEach((group, idx) => {
    if (group.anime_titles.length > 1) {
      console.log(`\nGroupe ${idx + 1}: ${group.canonical_title}`);
      group.anime_titles.forEach(title => console.log(`  - ${title}`));
      console.log(`  → ${group.characters.length} personnages uniques`);
    }
  });
  
  // Sauvegarder les données groupées
  await fs.writeFile("characters_grouped.json", JSON.stringify(grouped, null, 2));
  console.log("\n✓ Données groupées sauvegardées dans characters_grouped.json");
  
  // Statistiques
  console.log("\n=== STATISTIQUES ===");
  console.log(`Animes originaux: ${allData.length}`);
  console.log(`Groupes créés: ${grouped.length}`);
  console.log(`Personnages totaux: ${allData.reduce((sum, a) => sum + a.characters.length, 0)}`);
  console.log(`Personnages uniques: ${grouped.reduce((sum, g) => sum + g.characters.length, 0)}`);
}

main().catch(console.error); 