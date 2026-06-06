/**
 * Seed searchable_entities with:
 *   - Every Pokémon via PokeAPI (all generations, ~1,025 entries)
 *   - ~2,400 highly-collectible athletes across NBA, MLB, NFL, NHL, Soccer, WWE, F1
 *
 * Prerequisites:
 *   1. Run supabase/schema-v2.sql in Supabase SQL Editor.
 *   2. Add SUPABASE_SERVICE_ROLE_KEY to Replit Secrets.
 *
 * Run:  npm run seed
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Replit Secrets.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function toTitleCase(s) {
  return s.split(/[-\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function a(name, category) {
  const kw = { Basketball:"basketball card", Baseball:"baseball card", Football:"football card",
                Hockey:"hockey card", Soccer:"soccer card", WWE:"wrestling card", "Formula 1":"formula 1 card" };
  return { name, category, ebay_keyword: `${name} ${kw[category] ?? "card"}` };
}

async function fetchPokemon() {
  console.log("Fetching Pokémon from PokeAPI…");
  const r = await fetch("https://pokeapi.co/api/v2/pokemon?limit=1500");
  const { results } = await r.json();
  return results.map((p) => {
    const name = toTitleCase(p.name);
    return { name, category: "Pokemon", ebay_keyword: `${name} pokemon card` };
  });
}

const ATHLETES = [
  // ── NBA Legends ──────────────────────────────────────────────────────────
  a("Michael Jordan","Basketball"), a("LeBron James","Basketball"), a("Kobe Bryant","Basketball"),
  a("Magic Johnson","Basketball"), a("Larry Bird","Basketball"), a("Kareem Abdul-Jabbar","Basketball"),
  a("Wilt Chamberlain","Basketball"), a("Bill Russell","Basketball"), a("Oscar Robertson","Basketball"),
  a("Jerry West","Basketball"), a("Elgin Baylor","Basketball"), a("Julius Erving","Basketball"),
  a("Pete Maravich","Basketball"), a("Rick Barry","Basketball"), a("George Gervin","Basketball"),
  a("Moses Malone","Basketball"), a("Dominique Wilkins","Basketball"), a("Clyde Drexler","Basketball"),
  a("Isiah Thomas","Basketball"), a("Patrick Ewing","Basketball"), a("Charles Barkley","Basketball"),
  a("Shaquille O'Neal","Basketball"), a("Scottie Pippen","Basketball"), a("Dennis Rodman","Basketball"),
  a("John Stockton","Basketball"), a("Karl Malone","Basketball"), a("Hakeem Olajuwon","Basketball"),
  a("David Robinson","Basketball"), a("Gary Payton","Basketball"), a("Reggie Miller","Basketball"),
  a("Alonzo Mourning","Basketball"), a("Dikembe Mutombo","Basketball"), a("Penny Hardaway","Basketball"),
  a("Grant Hill","Basketball"), a("Vince Carter","Basketball"), a("Tracy McGrady","Basketball"),
  a("Allen Iverson","Basketball"), a("Steve Nash","Basketball"), a("Dirk Nowitzki","Basketball"),
  a("Jason Kidd","Basketball"), a("Tim Duncan","Basketball"), a("Kevin Garnett","Basketball"),
  a("Paul Pierce","Basketball"), a("Ray Allen","Basketball"), a("Yao Ming","Basketball"),
  a("Tony Parker","Basketball"), a("Manu Ginobili","Basketball"), a("Chauncey Billups","Basketball"),
  a("Dwyane Wade","Basketball"), a("Chris Bosh","Basketball"), a("Carmelo Anthony","Basketball"),
  a("Chris Paul","Basketball"), a("Dwight Howard","Basketball"), a("Derrick Rose","Basketball"),
  a("Blake Griffin","Basketball"), a("Russell Westbrook","Basketball"), a("James Harden","Basketball"),
  // ── NBA Modern & Rookies ──────────────────────────────────────────────────
  a("Stephen Curry","Basketball"), a("Kevin Durant","Basketball"), a("Giannis Antetokounmpo","Basketball"),
  a("Klay Thompson","Basketball"), a("Kawhi Leonard","Basketball"), a("Anthony Davis","Basketball"),
  a("Damian Lillard","Basketball"), a("Kyrie Irving","Basketball"), a("Paul George","Basketball"),
  a("Jimmy Butler","Basketball"), a("Joel Embiid","Basketball"), a("Nikola Jokic","Basketball"),
  a("Luka Doncic","Basketball"), a("Jayson Tatum","Basketball"), a("Jaylen Brown","Basketball"),
  a("Devin Booker","Basketball"), a("Bradley Beal","Basketball"), a("Donovan Mitchell","Basketball"),
  a("Trae Young","Basketball"), a("Zion Williamson","Basketball"), a("Ja Morant","Basketball"),
  a("LaMelo Ball","Basketball"), a("Tyrese Haliburton","Basketball"), a("Shai Gilgeous-Alexander","Basketball"),
  a("Anthony Edwards","Basketball"), a("Cade Cunningham","Basketball"), a("Paolo Banchero","Basketball"),
  a("Scottie Barnes","Basketball"), a("Evan Mobley","Basketball"), a("Franz Wagner","Basketball"),
  a("Jabari Smith Jr","Basketball"), a("Victor Wembanyama","Basketball"), a("Scoot Henderson","Basketball"),
  a("Brandon Miller","Basketball"), a("Chet Holmgren","Basketball"), a("Keegan Murray","Basketball"),
  a("Jalen Green","Basketball"), a("Josh Giddey","Basketball"), a("Anfernee Simons","Basketball"),
  a("De'Aaron Fox","Basketball"), a("Karl-Anthony Towns","Basketball"), a("Zach LaVine","Basketball"),
  a("DeMar DeRozan","Basketball"), a("OG Anunoby","Basketball"), a("Dejounte Murray","Basketball"),
  a("Draymond Green","Basketball"), a("CJ McCollum","Basketball"), a("Jamal Murray","Basketball"),
  a("Kristaps Porzingis","Basketball"), a("Marcus Smart","Basketball"), a("Derrick White","Basketball"),
  a("RJ Barrett","Basketball"), a("Miles Bridges","Basketball"), a("Darius Garland","Basketball"),
  a("Tyrese Maxey","Basketball"), a("Cam Thomas","Basketball"), a("Jalen Williams","Basketball"),
  a("Alperen Sengun","Basketball"), a("Brandon Ingram","Basketball"), a("Desmond Bane","Basketball"),
  a("Dyson Daniels","Basketball"), a("Reed Sheppard","Basketball"), a("Zaccharie Risacher","Basketball"),
  a("Alexandre Sarr","Basketball"),

  // ── MLB Legends ───────────────────────────────────────────────────────────
  a("Babe Ruth","Baseball"), a("Lou Gehrig","Baseball"), a("Ty Cobb","Baseball"),
  a("Honus Wagner","Baseball"), a("Mickey Mantle","Baseball"), a("Willie Mays","Baseball"),
  a("Hank Aaron","Baseball"), a("Ted Williams","Baseball"), a("Joe DiMaggio","Baseball"),
  a("Jackie Robinson","Baseball"), a("Stan Musial","Baseball"), a("Roberto Clemente","Baseball"),
  a("Satchel Paige","Baseball"), a("Roy Campanella","Baseball"), a("Yogi Berra","Baseball"),
  a("Warren Spahn","Baseball"), a("Bob Gibson","Baseball"), a("Sandy Koufax","Baseball"),
  a("Tom Seaver","Baseball"), a("Nolan Ryan","Baseball"), a("Ernie Banks","Baseball"),
  a("Duke Snider","Baseball"), a("Eddie Mathews","Baseball"), a("Frank Robinson","Baseball"),
  a("Harmon Killebrew","Baseball"), a("Carl Yastrzemski","Baseball"), a("Reggie Jackson","Baseball"),
  a("Rod Carew","Baseball"), a("Johnny Bench","Baseball"), a("Pete Rose","Baseball"),
  a("Carlton Fisk","Baseball"), a("Mike Schmidt","Baseball"), a("George Brett","Baseball"),
  a("Steve Carlton","Baseball"), a("Bert Blyleven","Baseball"), a("Ozzie Smith","Baseball"),
  a("Kirby Puckett","Baseball"), a("Ryne Sandberg","Baseball"), a("Tony Gwynn","Baseball"),
  a("Rickey Henderson","Baseball"), a("Robin Yount","Baseball"), a("Paul Molitor","Baseball"),
  a("Wade Boggs","Baseball"), a("Cal Ripken Jr","Baseball"), a("Dave Winfield","Baseball"),
  a("Gary Carter","Baseball"), a("Don Mattingly","Baseball"), a("Willie McCovey","Baseball"),
  a("Billy Williams","Baseball"), a("Juan Marichal","Baseball"), a("Jim Palmer","Baseball"),
  // ── MLB 90s–2000s ─────────────────────────────────────────────────────────
  a("Ken Griffey Jr","Baseball"), a("Barry Bonds","Baseball"), a("Alex Rodriguez","Baseball"),
  a("Derek Jeter","Baseball"), a("Randy Johnson","Baseball"), a("Roger Clemens","Baseball"),
  a("Greg Maddux","Baseball"), a("Tom Glavine","Baseball"), a("John Smoltz","Baseball"),
  a("Pedro Martinez","Baseball"), a("Curt Schilling","Baseball"), a("Mariano Rivera","Baseball"),
  a("Trevor Hoffman","Baseball"), a("Frank Thomas","Baseball"), a("Jeff Bagwell","Baseball"),
  a("Craig Biggio","Baseball"), a("Mike Piazza","Baseball"), a("Ivan Rodriguez","Baseball"),
  a("Chipper Jones","Baseball"), a("Andruw Jones","Baseball"), a("Vladimir Guerrero","Baseball"),
  a("Manny Ramirez","Baseball"), a("Albert Pujols","Baseball"), a("Jim Thome","Baseball"),
  a("David Ortiz","Baseball"), a("Sammy Sosa","Baseball"), a("Mark McGwire","Baseball"),
  a("Ichiro Suzuki","Baseball"), a("Larry Walker","Baseball"), a("Todd Helton","Baseball"),
  a("Scott Rolen","Baseball"), a("Roy Halladay","Baseball"), a("Johan Santana","Baseball"),
  a("CC Sabathia","Baseball"), a("Justin Verlander","Baseball"), a("Felix Hernandez","Baseball"),
  a("Ryan Howard","Baseball"), a("Hanley Ramirez","Baseball"), a("Evan Longoria","Baseball"),
  a("Joe Mauer","Baseball"), a("Troy Tulowitzki","Baseball"), a("Ryan Braun","Baseball"),
  a("Dustin Pedroia","Baseball"), a("Andrew McCutchen","Baseball"), a("Yadier Molina","Baseball"),
  a("Miguel Cabrera","Baseball"), a("Joey Votto","Baseball"), a("David Wright","Baseball"),
  a("Zack Greinke","Baseball"),
  // ── MLB Modern ────────────────────────────────────────────────────────────
  a("Mike Trout","Baseball"), a("Mookie Betts","Baseball"), a("Freddie Freeman","Baseball"),
  a("Nolan Arenado","Baseball"), a("Paul Goldschmidt","Baseball"), a("Bryce Harper","Baseball"),
  a("Jose Altuve","Baseball"), a("George Springer","Baseball"), a("Carlos Correa","Baseball"),
  a("Francisco Lindor","Baseball"), a("Trea Turner","Baseball"), a("Manny Machado","Baseball"),
  a("Clayton Kershaw","Baseball"), a("Max Scherzer","Baseball"), a("Jacob deGrom","Baseball"),
  a("Gerrit Cole","Baseball"), a("Zack Wheeler","Baseball"), a("Aaron Nola","Baseball"),
  a("Jose Ramirez","Baseball"), a("Shohei Ohtani","Baseball"), a("Aaron Judge","Baseball"),
  a("Giancarlo Stanton","Baseball"), a("Pete Alonso","Baseball"), a("Fernando Tatis Jr","Baseball"),
  a("Juan Soto","Baseball"), a("Vladimir Guerrero Jr","Baseball"), a("Bo Bichette","Baseball"),
  a("Ronald Acuna Jr","Baseball"), a("Ozzie Albies","Baseball"), a("Austin Riley","Baseball"),
  a("Michael Harris II","Baseball"), a("Spencer Strider","Baseball"), a("Yordan Alvarez","Baseball"),
  a("Jeremy Pena","Baseball"), a("Kyle Tucker","Baseball"), a("Bobby Witt Jr","Baseball"),
  a("Gunnar Henderson","Baseball"), a("Anthony Volpe","Baseball"), a("Julio Rodriguez","Baseball"),
  a("Randy Arozarena","Baseball"), a("Corbin Carroll","Baseball"), a("Elly De La Cruz","Baseball"),
  a("Jackson Chourio","Baseball"), a("Paul Skenes","Baseball"), a("Jackson Holliday","Baseball"),
  a("Adley Rutschman","Baseball"), a("Corey Seager","Baseball"), a("Marcus Semien","Baseball"),
  a("Jazz Chisholm Jr","Baseball"), a("Pete Crow-Armstrong","Baseball"), a("James Wood","Baseball"),
  a("Colton Cowser","Baseball"), a("Jackson Merrill","Baseball"), a("Wyatt Langford","Baseball"),

  // ── NFL Legends ───────────────────────────────────────────────────────────
  a("Jim Brown","Football"), a("Johnny Unitas","Football"), a("Bart Starr","Football"),
  a("Dick Butkus","Football"), a("Gale Sayers","Football"), a("Fran Tarkenton","Football"),
  a("Roger Staubach","Football"), a("Bob Griese","Football"), a("Larry Csonka","Football"),
  a("Franco Harris","Football"), a("Lynn Swann","Football"), a("Terry Bradshaw","Football"),
  a("Walter Payton","Football"), a("Tony Dorsett","Football"), a("Earl Campbell","Football"),
  a("Eric Dickerson","Football"), a("Marcus Allen","Football"), a("Dan Fouts","Football"),
  a("Kellen Winslow","Football"), a("Anthony Munoz","Football"), a("Lawrence Taylor","Football"),
  a("Mike Singletary","Football"), a("Ronnie Lott","Football"), a("Mean Joe Greene","Football"),
  a("Jack Lambert","Football"), a("Jack Ham","Football"), a("Joe Montana","Football"),
  a("Jerry Rice","Football"), a("Dwight Clark","Football"), a("Charles Haley","Football"),
  a("Deion Sanders","Football"), a("Barry Sanders","Football"), a("Emmitt Smith","Football"),
  a("Troy Aikman","Football"), a("Michael Irvin","Football"), a("Steve Young","Football"),
  a("Dan Marino","Football"), a("Reggie White","Football"), a("Brett Favre","Football"),
  a("Tim Brown","Football"), a("Rod Woodson","Football"), a("Derrick Thomas","Football"),
  a("Bruce Smith","Football"), a("Chris Carter","Football"), a("Randy Moss","Football"),
  a("Terrell Owens","Football"), a("Marvin Harrison","Football"), a("Peyton Manning","Football"),
  a("Edgerrin James","Football"), a("Ray Lewis","Football"), a("Ed Reed","Football"),
  a("Brian Urlacher","Football"), a("Tony Gonzalez","Football"), a("LaDainian Tomlinson","Football"),
  a("Michael Vick","Football"), a("Steve McNair","Football"), a("Chad Johnson","Football"),
  a("Larry Fitzgerald","Football"), a("Calvin Johnson","Football"), a("Andre Johnson","Football"),
  a("Adrian Peterson","Football"), a("Drew Brees","Football"), a("Tom Brady","Football"),
  a("Rob Gronkowski","Football"), a("Wes Welker","Football"), a("Aaron Rodgers","Football"),
  a("Eli Manning","Football"), a("Philip Rivers","Football"), a("Matt Ryan","Football"),
  a("Marshawn Lynch","Football"), a("Julio Jones","Football"), a("Dez Bryant","Football"),
  a("A.J. Green","Football"), a("Antonio Brown","Football"), a("Le'Veon Bell","Football"),
  a("Odell Beckham Jr","Football"), a("Demaryius Thomas","Football"),
  // ── NFL Modern & Rookies ──────────────────────────────────────────────────
  a("Patrick Mahomes","Football"), a("Josh Allen","Football"), a("Lamar Jackson","Football"),
  a("Joe Burrow","Football"), a("Jalen Hurts","Football"), a("Justin Herbert","Football"),
  a("Dak Prescott","Football"), a("Tua Tagovailoa","Football"), a("Trevor Lawrence","Football"),
  a("Brock Purdy","Football"), a("Kyler Murray","Football"), a("Travis Kelce","Football"),
  a("Tyreek Hill","Football"), a("Davante Adams","Football"), a("Cooper Kupp","Football"),
  a("Ja'Marr Chase","Football"), a("Justin Jefferson","Football"), a("Stefon Diggs","Football"),
  a("CeeDee Lamb","Football"), a("Deebo Samuel","Football"), a("Amari Cooper","Football"),
  a("DeAndre Hopkins","Football"), a("Mike Evans","Football"), a("DK Metcalf","Football"),
  a("Tyler Lockett","Football"), a("Christian McCaffrey","Football"), a("Derrick Henry","Football"),
  a("Nick Chubb","Football"), a("Austin Ekeler","Football"), a("Jonathan Taylor","Football"),
  a("Alvin Kamara","Football"), a("Josh Jacobs","Football"), a("Tony Pollard","Football"),
  a("Bijan Robinson","Football"), a("Jahmyr Gibbs","Football"), a("De'Von Achane","Football"),
  a("Puka Nacua","Football"), a("Garrett Wilson","Football"), a("Chris Olave","Football"),
  a("Jaxon Smith-Njigba","Football"), a("Drake London","Football"), a("George Pickens","Football"),
  a("Brian Thomas Jr","Football"), a("Marvin Harrison Jr","Football"), a("Rome Odunze","Football"),
  a("Malik Nabers","Football"), a("Caleb Williams","Football"), a("Jayden Daniels","Football"),
  a("Drake Maye","Football"), a("Bo Nix","Football"), a("Micah Parsons","Football"),
  a("Sauce Gardner","Football"), a("Jalen Ramsey","Football"), a("Trevon Diggs","Football"),
  a("Myles Garrett","Football"), a("Nick Bosa","Football"), a("Maxx Crosby","Football"),
  a("TJ Watt","Football"), a("Roquan Smith","Football"), a("Fred Warner","Football"),
  a("Saquon Barkley","Football"), a("Ezekiel Elliott","Football"), a("Najee Harris","Football"),
  a("Joe Mixon","Football"), a("Brandon Aiyuk","Football"), a("Sam LaPorta","Football"),
  a("Trey McBride","Football"),

  // ── NHL Legends ───────────────────────────────────────────────────────────
  a("Wayne Gretzky","Hockey"), a("Mario Lemieux","Hockey"), a("Bobby Orr","Hockey"),
  a("Gordie Howe","Hockey"), a("Maurice Richard","Hockey"), a("Phil Esposito","Hockey"),
  a("Bobby Hull","Hockey"), a("Stan Mikita","Hockey"), a("Guy Lafleur","Hockey"),
  a("Mike Bossy","Hockey"), a("Bryan Trottier","Hockey"), a("Denis Potvin","Hockey"),
  a("Paul Coffey","Hockey"), a("Jari Kurri","Hockey"), a("Mark Messier","Hockey"),
  a("Glenn Anderson","Hockey"), a("Grant Fuhr","Hockey"), a("Luc Robitaille","Hockey"),
  a("Brett Hull","Hockey"), a("Al MacInnis","Hockey"), a("Patrick Roy","Hockey"),
  a("Mike Modano","Hockey"), a("Joe Nieuwendyk","Hockey"), a("Brendan Shanahan","Hockey"),
  a("Doug Gilmour","Hockey"), a("Steve Yzerman","Hockey"), a("Nicklas Lidstrom","Hockey"),
  a("Sergei Fedorov","Hockey"), a("Eric Lindros","Hockey"), a("John LeClair","Hockey"),
  a("Peter Forsberg","Hockey"), a("Joe Sakic","Hockey"), a("Teemu Selanne","Hockey"),
  a("Paul Kariya","Hockey"), a("Jaromir Jagr","Hockey"), a("Dominik Hasek","Hockey"),
  a("Martin Brodeur","Hockey"), a("Scott Stevens","Hockey"), a("Mats Sundin","Hockey"),
  a("Daniel Alfredsson","Hockey"), a("Saku Koivu","Hockey"), a("Rob Blake","Hockey"),
  a("Chris Chelios","Hockey"), a("Zdeno Chara","Hockey"),
  // ── NHL Modern ────────────────────────────────────────────────────────────
  a("Sidney Crosby","Hockey"), a("Alexander Ovechkin","Hockey"), a("Evgeni Malkin","Hockey"),
  a("Patrick Kane","Hockey"), a("Jonathan Toews","Hockey"), a("John Tavares","Hockey"),
  a("Henrik Zetterberg","Hockey"), a("Pavel Datsyuk","Hockey"), a("Phil Kessel","Hockey"),
  a("Nicklas Backstrom","Hockey"), a("Marc-Andre Fleury","Hockey"), a("Henrik Lundqvist","Hockey"),
  a("Carey Price","Hockey"), a("Mark Scheifele","Hockey"), a("Nathan MacKinnon","Hockey"),
  a("Gabriel Landeskog","Hockey"), a("Mikko Rantanen","Hockey"), a("Cale Makar","Hockey"),
  a("Connor McDavid","Hockey"), a("Leon Draisaitl","Hockey"), a("Ryan Nugent-Hopkins","Hockey"),
  a("Auston Matthews","Hockey"), a("Mitch Marner","Hockey"), a("William Nylander","Hockey"),
  a("Morgan Rielly","Hockey"), a("Elias Pettersson","Hockey"), a("Bo Horvat","Hockey"),
  a("Quinn Hughes","Hockey"), a("Brock Boeser","Hockey"), a("Matthew Tkachuk","Hockey"),
  a("Johnny Gaudreau","Hockey"), a("Noah Hanifin","Hockey"), a("David Pastrnak","Hockey"),
  a("Brad Marchand","Hockey"), a("Patrice Bergeron","Hockey"), a("Charlie McAvoy","Hockey"),
  a("Nikita Kucherov","Hockey"), a("Steven Stamkos","Hockey"), a("Brayden Point","Hockey"),
  a("Andrei Vasilevskiy","Hockey"), a("Victor Hedman","Hockey"), a("John Carlson","Hockey"),
  a("Igor Shesterkin","Hockey"), a("Artemi Panarin","Hockey"), a("Alexis Lafreniere","Hockey"),
  a("Tim Stutzle","Hockey"), a("Owen Power","Hockey"), a("Connor Bedard","Hockey"),
  a("Adam Fantilli","Hockey"), a("Matvei Michkov","Hockey"), a("Leo Carlsson","Hockey"),
  a("Matty Beniers","Hockey"), a("Logan Cooley","Hockey"),

  // ── Soccer Legends ────────────────────────────────────────────────────────
  a("Pele","Soccer"), a("Diego Maradona","Soccer"), a("Johan Cruyff","Soccer"),
  a("Michel Platini","Soccer"), a("Franz Beckenbauer","Soccer"), a("Marco Van Basten","Soccer"),
  a("George Best","Soccer"), a("Bobby Charlton","Soccer"), a("Zico","Soccer"),
  a("Gerd Muller","Soccer"), a("Lothar Matthaus","Soccer"), a("Ruud Gullit","Soccer"),
  a("Frank Rijkaard","Soccer"), a("Dennis Bergkamp","Soccer"), a("Patrick Kluivert","Soccer"),
  a("Edgar Davids","Soccer"), a("Clarence Seedorf","Soccer"), a("Paolo Maldini","Soccer"),
  a("Franco Baresi","Soccer"), a("Roberto Baggio","Soccer"), a("Alessandro Del Piero","Soccer"),
  a("Gianluigi Buffon","Soccer"), a("Fabio Cannavaro","Soccer"), a("Francesco Totti","Soccer"),
  a("Andrea Pirlo","Soccer"), a("Patrick Vieira","Soccer"), a("Zinedine Zidane","Soccer"),
  a("Thierry Henry","Soccer"), a("Eric Cantona","Soccer"), a("Alan Shearer","Soccer"),
  a("David Beckham","Soccer"), a("Steven Gerrard","Soccer"), a("Frank Lampard","Soccer"),
  a("Rio Ferdinand","Soccer"), a("Paul Scholes","Soccer"), a("Ryan Giggs","Soccer"),
  a("Peter Schmeichel","Soccer"), a("Roy Keane","Soccer"), a("Ronaldo Nazario","Soccer"),
  a("Rivaldo","Soccer"), a("Ronaldinho","Soccer"), a("Roberto Carlos","Soccer"),
  a("Cafu","Soccer"), a("Adriano","Soccer"), a("Kaka","Soccer"),
  // ── Soccer Modern ─────────────────────────────────────────────────────────
  a("Lionel Messi","Soccer"), a("Cristiano Ronaldo","Soccer"), a("Neymar Jr","Soccer"),
  a("Kylian Mbappe","Soccer"), a("Erling Haaland","Soccer"), a("Vinicius Junior","Soccer"),
  a("Mohamed Salah","Soccer"), a("Kevin De Bruyne","Soccer"), a("Virgil Van Dijk","Soccer"),
  a("Luka Modric","Soccer"), a("Karim Benzema","Soccer"), a("Robert Lewandowski","Soccer"),
  a("Harry Kane","Soccer"), a("Sadio Mane","Soccer"), a("Riyad Mahrez","Soccer"),
  a("Raheem Sterling","Soccer"), a("Eden Hazard","Soccer"), a("Antoine Griezmann","Soccer"),
  a("Paulo Dybala","Soccer"), a("Romelu Lukaku","Soccer"), a("Marcus Rashford","Soccer"),
  a("Jadon Sancho","Soccer"), a("Bruno Fernandes","Soccer"), a("N'Golo Kante","Soccer"),
  a("Toni Kroos","Soccer"), a("Sergio Ramos","Soccer"), a("Marcelo","Soccer"),
  a("David Alaba","Soccer"), a("Casemiro","Soccer"), a("Gianluigi Donnarumma","Soccer"),
  a("Thibaut Courtois","Soccer"), a("Alisson Becker","Soccer"), a("Ederson","Soccer"),
  a("Lorenzo Insigne","Soccer"), a("Ciro Immobile","Soccer"), a("Nicolo Barella","Soccer"),
  a("Pedri","Soccer"), a("Gavi","Soccer"), a("Ansu Fati","Soccer"),
  a("Bukayo Saka","Soccer"), a("Phil Foden","Soccer"), a("Jack Grealish","Soccer"),
  a("Jude Bellingham","Soccer"), a("Declan Rice","Soccer"), a("Jarrod Bowen","Soccer"),
  a("Florian Wirtz","Soccer"), a("Jamal Musiala","Soccer"), a("Leroy Sane","Soccer"),
  a("Christopher Nkunku","Soccer"), a("Randal Kolo Muani","Soccer"), a("Benjamin Sesko","Soccer"),
  a("Alejandro Garnacho","Soccer"), a("Kobbie Mainoo","Soccer"), a("Lamine Yamal","Soccer"),
  a("Endrick","Soccer"), a("Rodrygo","Soccer"), a("Richarlison","Soccer"),
  a("Cody Gakpo","Soccer"), a("Xavi Simons","Soccer"), a("Giovanni Reyna","Soccer"),
  a("Christian Pulisic","Soccer"), a("Tyler Adams","Soccer"), a("Weston McKennie","Soccer"),
  a("Folarin Balogun","Soccer"), a("Yunus Musah","Soccer"),

  // ── WWE ───────────────────────────────────────────────────────────────────
  a("Hulk Hogan","WWE"), a("The Rock","WWE"), a("Stone Cold Steve Austin","WWE"),
  a("The Undertaker","WWE"), a("Shawn Michaels","WWE"), a("Triple H","WWE"),
  a("Ric Flair","WWE"), a("Randy Savage","WWE"), a("Andre the Giant","WWE"),
  a("Mick Foley","WWE"), a("Kurt Angle","WWE"), a("Edge","WWE"),
  a("Chris Jericho","WWE"), a("Bret Hart","WWE"), a("Owen Hart","WWE"),
  a("Roddy Piper","WWE"), a("Dusty Rhodes","WWE"), a("Sting","WWE"),
  a("Goldberg","WWE"), a("John Cena","WWE"), a("Batista","WWE"),
  a("Rey Mysterio","WWE"), a("CM Punk","WWE"), a("Randy Orton","WWE"),
  a("Seth Rollins","WWE"), a("Roman Reigns","WWE"), a("Sasha Banks","WWE"),
  a("Becky Lynch","WWE"), a("Charlotte Flair","WWE"), a("Bayley","WWE"),
  a("Trish Stratus","WWE"), a("Lita","WWE"), a("Ronda Rousey","WWE"),
  a("Alexa Bliss","WWE"), a("Bianca Belair","WWE"), a("Rhea Ripley","WWE"),
  a("AJ Styles","WWE"), a("Kevin Owens","WWE"), a("Sami Zayn","WWE"),
  a("Bobby Lashley","WWE"), a("Brock Lesnar","WWE"), a("The Miz","WWE"),
  a("Sheamus","WWE"), a("Finn Balor","WWE"), a("Samoa Joe","WWE"),
  a("Big E","WWE"), a("Kofi Kingston","WWE"), a("Cody Rhodes","WWE"),
  a("Damian Priest","WWE"), a("Gunther","WWE"), a("LA Knight","WWE"),
  a("Solo Sikoa","WWE"), a("Jacob Fatu","WWE"),

  // ── Formula 1 ────────────────────────────────────────────────────────────
  a("Ayrton Senna","Formula 1"), a("Michael Schumacher","Formula 1"),
  a("Alain Prost","Formula 1"), a("Niki Lauda","Formula 1"),
  a("Jim Clark","Formula 1"), a("Jackie Stewart","Formula 1"),
  a("Juan Manuel Fangio","Formula 1"), a("Stirling Moss","Formula 1"),
  a("Graham Hill","Formula 1"), a("Emerson Fittipaldi","Formula 1"),
  a("Mario Andretti","Formula 1"), a("Gilles Villeneuve","Formula 1"),
  a("Nelson Piquet","Formula 1"), a("Nigel Mansell","Formula 1"),
  a("Damon Hill","Formula 1"), a("Jacques Villeneuve","Formula 1"),
  a("Mika Hakkinen","Formula 1"), a("David Coulthard","Formula 1"),
  a("Rubens Barrichello","Formula 1"), a("Jenson Button","Formula 1"),
  a("Mark Webber","Formula 1"), a("Felipe Massa","Formula 1"),
  a("Sebastian Vettel","Formula 1"), a("Fernando Alonso","Formula 1"),
  a("Kimi Raikkonen","Formula 1"), a("Nico Rosberg","Formula 1"),
  a("Lewis Hamilton","Formula 1"), a("Valtteri Bottas","Formula 1"),
  a("Daniel Ricciardo","Formula 1"), a("Max Verstappen","Formula 1"),
  a("Sergio Perez","Formula 1"), a("Charles Leclerc","Formula 1"),
  a("Carlos Sainz","Formula 1"), a("Lando Norris","Formula 1"),
  a("George Russell","Formula 1"), a("Oscar Piastri","Formula 1"),
  a("Yuki Tsunoda","Formula 1"), a("Alex Albon","Formula 1"),
  a("Pierre Gasly","Formula 1"), a("Esteban Ocon","Formula 1"),
  a("Lance Stroll","Formula 1"), a("Nico Hulkenberg","Formula 1"),
  a("Kevin Magnussen","Formula 1"), a("Guanyu Zhou","Formula 1"),
  a("Franco Colapinto","Formula 1"), a("Oliver Bearman","Formula 1"),
  a("Jack Doohan","Formula 1"), a("Isack Hadjar","Formula 1"),
];

async function seed() {
  const pokemon = await fetchPokemon();
  const all = [...pokemon, ...ATHLETES];

  console.log(`\nTotal entities to seed: ${all.length}`);
  console.log(`Uploading in ${Math.ceil(all.length / 500)} chunks…\n`);

  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK);
    const { error } = await supabase.from("searchable_entities").upsert(chunk, { onConflict: "name,category" });
    if (error) {
      console.error(`  ✗ Chunk ${Math.floor(i / CHUNK) + 1} failed:`, error.message);
    } else {
      inserted += chunk.length;
      console.log(`  ✓ Chunk ${Math.floor(i / CHUNK) + 1}/${Math.ceil(all.length / CHUNK)} — ${inserted} total`);
    }
  }
  console.log(`\nDone! ${inserted} entities ready for autocomplete.`);
}

seed().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
