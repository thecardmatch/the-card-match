/**
 * GET /api/onboarding
 * Returns the 20 static onboarding cards for the Card DNA Quiz.
 */
import { jsonResponse, onRequestOptions as _cors } from "../../_shared/ebay.js";

export { _cors as onRequestOptions };

// Onboarding cards are inlined here so no filesystem access is needed at runtime.
// Keep in sync with server/onboarding-cards.json (run server/seedOnboarding.js then copy).
const RAW_CARDS = [
  { id:"ob-fb-1", name:"2023 Panini Prizm C.J. Stroud Silver RC (PSA 10)", category:"Football", player_name:"C.J. Stroud", image:"https://i.ebayimg.com/images/g/OIgAAeSwIX5qbqUj/s-l800.jpg", grade:"PSA 10", listing_type:"Buy It Now", current_bid:450, attributes:{is_onboarding:true,era:"Modern",style:"Slab"} },
  { id:"ob-fb-2", name:"1981 Topps Joe Montana #216 (PSA 8)", category:"Football", player_name:"Joe Montana", image:"https://i.ebayimg.com/images/g/TqwAAeSw9ABqX7lz/s-l800.jpg", grade:"PSA 8", listing_type:"Buy It Now", current_bid:850, attributes:{is_onboarding:true,era:"Vintage",style:"Slab"} },
  { id:"ob-fb-3", name:"2024 National Treasures Jayden Daniels RPA /99 Auto", category:"Football", player_name:"Jayden Daniels", image:"https://i.ebayimg.com/images/g/UIIAAeSwvElqIQ2n/s-l800.jpg", grade:"Raw", listing_type:"Auction", current_bid:1800, attributes:{is_onboarding:true,era:"Modern",style:"RPA_Auto"} },
  { id:"ob-bb-1", name:"2018 Bowman Chrome Shohei Ohtani Auto (PSA 10)", category:"Baseball", player_name:"Shohei Ohtani", image:"https://i.ebayimg.com/images/g/MjkAAeSwGqVqMYtS/s-l800.jpg", grade:"PSA 10", listing_type:"Buy It Now", current_bid:3500, attributes:{is_onboarding:true,era:"Modern",style:"Auto"} },
  { id:"ob-bb-2", name:"1956 Topps Mickey Mantle #135 (PSA 5)", category:"Baseball", player_name:"Mickey Mantle", image:"https://i.ebayimg.com/images/g/vDQAAeSwaHRqMzce/s-l800.jpg", grade:"PSA 5", listing_type:"Buy It Now", current_bid:2800, attributes:{is_onboarding:true,era:"Vintage",style:"Slab"} },
  { id:"ob-bb-3", name:"2024 Bowman Chrome Paul Skenes 1st Bowman Auto", category:"Baseball", player_name:"Paul Skenes", image:"https://i.ebayimg.com/images/g/IzwAAeSwSzpqC1NJ/s-l800.jpg", grade:"Raw", listing_type:"Auction", current_bid:420, attributes:{is_onboarding:true,era:"Modern",style:"Prospect"} },
  { id:"ob-bk-1", name:"2023 Panini Prizm Victor Wembanyama #136 (PSA 10)", category:"Basketball", player_name:"Victor Wembanyama", image:"https://i.ebayimg.com/images/g/VSsAAeSwiBtqb~Sc/s-l800.jpg", grade:"PSA 10", listing_type:"Buy It Now", current_bid:450, attributes:{is_onboarding:true,era:"Modern",style:"Slab"} },
  { id:"ob-bk-2", name:"1986 Fleer Michael Jordan #57 (PSA 8)", category:"Basketball", player_name:"Michael Jordan", image:"https://i.ebayimg.com/images/g/3xYAAeSwsehqY4xk/s-l800.jpg", grade:"PSA 8", listing_type:"Buy It Now", current_bid:8200, attributes:{is_onboarding:true,era:"Vintage",style:"Grail"} },
  { id:"ob-bk-3", name:"2018 National Treasures Luka Doncic RPA Auto /99", category:"Basketball", player_name:"Luka Doncic", image:"https://i.ebayimg.com/images/g/OEMAAeSwB-dqXJqY/s-l800.jpg", grade:"Raw", listing_type:"Auction", current_bid:11500, attributes:{is_onboarding:true,era:"Modern",style:"RPA_Auto"} },
  { id:"ob-pk-1", name:"2021 Pokémon Evolving Skies Umbreon VMAX Alt Art (PSA 10)", category:"Pokemon", player_name:"Umbreon", image:"https://i.ebayimg.com/images/g/lgcAAeSw2S9qaUWh/s-l800.jpg", grade:"PSA 10", listing_type:"Buy It Now", current_bid:950, attributes:{is_onboarding:true,era:"Modern",style:"AltArt"} },
  { id:"ob-pk-2", name:"1999 Pokémon Base Set Shadowless Charizard #4 (PSA 8)", category:"Pokemon", player_name:"Charizard", image:"https://i.ebayimg.com/images/g/qQEAAeSw3jFqbLcq/s-l800.jpg", grade:"PSA 8", listing_type:"Buy It Now", current_bid:2400, attributes:{is_onboarding:true,era:"Vintage",style:"Grail"} },
  { id:"ob-pk-3", name:"2023 Pokémon 151 Special Illustration Rare Pikachu", category:"Pokemon", player_name:"Pikachu", image:"https://i.ebayimg.com/images/g/JT0AAOSwg4RoM6FE/s-l800.jpg", grade:"Raw", listing_type:"Buy It Now", current_bid:85, attributes:{is_onboarding:true,era:"Modern",style:"Raw"} },
  { id:"ob-mtg-1", name:"1993 MTG Alpha Black Lotus (BGS 8.5)", category:"MTG", player_name:"Black Lotus", image:"https://i.ebayimg.com/images/g/tt0AAeSwraVqWSt0/s-l800.jpg", grade:"BGS 8.5", listing_type:"Buy It Now", current_bid:45000, attributes:{is_onboarding:true,era:"Vintage",style:"Grail"} },
  { id:"ob-mtg-2", name:"2023 MTG Lord of the Rings The One Ring Foil", category:"MTG", player_name:"The One Ring", image:"https://i.ebayimg.com/images/g/NBEAAeSw7Ehqb34H/s-l800.jpg", grade:"PSA 10", listing_type:"Buy It Now", current_bid:650, attributes:{is_onboarding:true,era:"Modern",style:"Slab"} },
  { id:"ob-sc-1", name:"2004 Panini Mega Cracks Lionel Messi Rookie #71 (PSA 7)", category:"Soccer", player_name:"Lionel Messi", image:"https://i.ebayimg.com/images/g/A1QAAeSwh~xqbQad/s-l800.jpg", grade:"PSA 7", listing_type:"Buy It Now", current_bid:3100, attributes:{is_onboarding:true,era:"Vintage",style:"Rookie"} },
  { id:"ob-sc-2", name:"2022 Panini Prizm Erling Haaland Silver (PSA 10)", category:"Soccer", player_name:"Erling Haaland", image:"https://i.ebayimg.com/images/g/dT4AAeSwSytov4jM/s-l800.jpg", grade:"PSA 10", listing_type:"Buy It Now", current_bid:280, attributes:{is_onboarding:true,era:"Modern",style:"Slab"} },
  { id:"ob-hk-1", name:"2023 Upper Deck Connor Bedard Young Guns #451 (PSA 10)", category:"Hockey", player_name:"Connor Bedard", image:"https://i.ebayimg.com/images/g/BEgAAeSwrIhqCgzi/s-l800.jpg", grade:"PSA 10", listing_type:"Buy It Now", current_bid:650, attributes:{is_onboarding:true,era:"Modern",style:"Slab"} },
  { id:"ob-hk-2", name:"1979 O-Pee-Chee Wayne Gretzky Rookie #18 (PSA 6)", category:"Hockey", player_name:"Wayne Gretzky", image:"https://i.ebayimg.com/images/g/iCYAAeSwn2Jqb93E/s-l800.jpg", grade:"PSA 6", listing_type:"Buy It Now", current_bid:4500, attributes:{is_onboarding:true,era:"Vintage",style:"Grail"} },
  { id:"ob-wc-1", name:"2020 Topps Chrome F1 Lewis Hamilton Gold Refractor /50", category:"Racing", player_name:"Lewis Hamilton", image:"https://i.ebayimg.com/images/g/NhkAAeSw1XdqRB5u/s-l800.jpg", grade:"PSA 10", listing_type:"Buy It Now", current_bid:2800, attributes:{is_onboarding:true,era:"Modern",style:"Luxury"} },
  { id:"ob-wc-2", name:"2013 Fleer Retro Marvel Metal Spider-Man PMG Red /100", category:"PopCulture", player_name:"Spider-Man", image:"https://i.ebayimg.com/images/g/udQAAeSwRTtqYkuW/s-l800.jpg", grade:"PSA 9", listing_type:"Buy It Now", current_bid:3400, attributes:{is_onboarding:true,era:"Modern",style:"Grail"} },
];

export async function onRequestGet() {
  const items = RAW_CARDS.map((c) => ({
    id:              c.id,
    name:            c.name,
    category:        c.category,
    image:           c.image,
    images:          [],
    currentBid:      c.current_bid ?? 0,
    currency:        "USD",
    grade:           c.grade || "Raw",
    ebayUrl:         `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(c.name)}`,
    endTime:         null,
    listingType:     c.listing_type === "Auction" ? "Auction" : "Buy It Now",
    watchCount:      0,
    bidCount:        0,
    engagementScore: 0,
    condition:       c.grade || "",
    playerName:      c.player_name || "",
    attributes:      c.attributes || {},
  }));
  return jsonResponse({ items });
}
