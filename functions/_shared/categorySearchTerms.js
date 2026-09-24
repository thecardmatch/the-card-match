const RAW_CATEGORY_SEARCH_TERMS = {
  "Football": `Josh Allen
James Cook
DJ Moore
De’Von Achane
Malik Willis
Drake Maye
AJ Brown
Breece Hall
Garrett Wilson
Lamar Jackson
Zay Flowers
Derrick Henry
Joe Burrow
Jamar Chase
Tee Higgins
Chase Brown
Rico Dowdle
Jaylen Warren
DK Metcalf
Shedeur Sanders
KC Conception
Denzel Boston
Quinshon Judkins
CJ Stroud
Nico Collins
David Montgomery
Jonathan Taylor
Daniel Jones
Alec Pierce
Josh Downs
Tyler Warren
Trevor Lawrence
Brian Thomas Jr.
Parker Washington
Travis Hunter
Bhayshul Tuten
Cam Ward
Carnell Tate
Tony Pollard
Wandale Robinson
Bo Nix
Jaylen Waddle
Courtland Sutton
RJ Harvey
JK Dobbins
Jonah Coleman
Patrick Mahomes
Travis Kelce
Rashee Rice
Xavier Worthy
Kenneth Walker
Emmett Johnson
Fernando Mendoza
Ashton Jeanty
Brock Bowers
Justin Herbert
Omarion Hampton
Ladd McConkey
Dak Prescott
CeeDee Lamb
George Pickens
Javonte Williams
Jaxson Dart
Cam Skattebo
Malik Nabers
Odell Beckham Jr
Isaiah Likely
Jalen Hurts
Saquon Barkley
DeVonta Smith
Jayden Daniels
Stefon Diggs
Terry McLaurin
Jacory Croskey-Merritt
Rachaad White
Antonio Williams
Caleb Williams
D’Andre Swift
Rome Odunze
Luther Burden
Colston Loveland
Kyle Monangai
Jared Goff
Jahmyr Gibbs
Jameson Williams
Amon-Ra St. Brown
Sam LaPorta
Jordan Love
Christian Watson
Matthew Golden
Josh Jacobs
Tucker Kraft
Kyler Murray
Justin Jefferson
Jordan Addison
Aaron Jones
Jordan Mason
Michael Penix Jr
Tua Tagovailoa
Bijan Robinson
Kyle Pitts
Drake London
Bryce Young
Jonathon Brooks
Jalen Coker
Tetairoa McMillan
Chuba Hubbard
Tyler Schough
Travis Etienne
Chris Olave
Devaughn Vele
Baker Mayfield
Bucky Irving
Emeka Egbuka
Jacoby Brissett
Marvin Harrison Jr.
Jeremiyah Love
Trey McBride
Michael Wilson Jr.
Matt Stafford
Matthew Stafford
Kyren Williams
Blake Corum
Davante Adams
Puka Nacua
Terrance Ferguson
Brock Purdy
Christian McCaffrey
Deebo Samuel
George Kittle
Mike Evans
Kaelon Black
De'Zhaun Stribling
Sam Darnold
Jadarian Price
Jaxon Smith-Njigba
Myles Garrett
Will Anderson Jr.
Aidan Hutchinson
Micah Parsons
Patrick Surtain II
Derick Singley
Fred Warner
Quinnen Williams
Aaron Rodgers`,
  "Baseball": `Pete Alonso
Gunnar Henderson
Roman Anthony
Jarren Duran
Ceddanne Rafaela
Aaron Judge
Gerrit Cole
Max Fried
Cam Schlittler
Jazz Chisholm Jr.
George Lombard Jr.
Cody Bellinger
Spencer Jones
Ben Rice
Junior Caminero
Jonathan Aranda
Vladimir Guerrero Jr.
Kazuma Okamoto
George Springer
Ronald Acuna Jr.
Drake Baldwin
Matt Olson
Austin Riley
Ozzie Albies
Michael Harris II
Kyle Stowers
Nolan McLean
Bo Bichette
Francisco Lindor
Carson Benge
A.J. Ewing
Juan Soto
Christopher Sanchez
Bryce Harper
Trea Turner
Kyle Schwarber
CJ Abrams
Dylan Crews
James Wood
Kyle Teel
Munetaka Murakami
Miguel Vargas
Colson Montgomery
Parker Messick
Travis Bazzana
Jose Ramirez
Chase DeLauter
Kevin McGonigle
Max Clark
Riley Greene
Carter Jensen
Vinnie Pasquantino
Maikel Garcia
Bobby Witt Jr.
Jac Caglianone
Walker Jenkins
Royce Lewis
Pete Crow-Armstrong
Alex Bregman
Michael Busch
Seiya Suzuki
Elly De La Cruz
Sal Stewart
Jackson Chourio
Christian Yelich
Jacob Misiorowski
Luis Lara
Paul Skenes
Konnor Griffin
Oneil Cruz
JJ Wetherholt
Jordan Walker
Nick Kurtz
Zack Gelof
Henry Bolte
Jose Altuve
Jeremy Pena
Yordan Alvarez
Mike Trout
Zach Neto
Julio Rodriguez
Randy Arozarena
Dominic Canzone
Taylor Ward
Jacob DeGrom
Max Scherzer
Corey Seager
Wyatt Langford
Nolan Arenado
Corbin Carroll
Jordan Lawlar
Ryan Waldschmidt
Hunter Goodman
Cole Carrigg
Zac Veen
Shohei Ohtani
Tarik Skubal
Yoshinobu Yamamoto
Mookie Betts
Freddie Freeman
Kyle Tucker
Mason Miller
Manny Machado
Jackson Merrill
Fernando Tatis Jr.
Bryce Eldridge
Jesus Made
Leo De Vries
Franklin Arias
Eli Willits
Kade Anderson
Josue De Paula
Seth Hernandez
Ryan Sloan
Sebastian Walcott
Grady Emerson
Roch Cholowsky
Theo Gillen
Mike Sirota
Josuar Gonzalez
Rainel Rodriguez
Joshua Baez
Luis Pena
Vahn Lackey
Eduardo Quintero
Alfredo Duno
Ethan Salas
Ethan Holliday
Emil Morales
JoJo Parker
Zyhir Hope
Caleb Bonemer
Kaelen Culpepper
Ralphy Velasquez
Charlie Condon
River Ryan`,
  "Basketball": `Michael Jordan
Kobe Bryant
LeBron James
Magic Johnson
Larry Bird
Wilt Chamberlain
Bill Russell
Kareem Abdul-Jabbar
Shaquille O'Neal
Hakeem Olajuwon
Tim Duncan
Stephen Curry
Kevin Durant
Allen Iverson
Charles Barkley
Karl Malone
John Stockton
Julius Erving
David Robinson
Patrick Ewing
Scottie Pippen
Dwyane Wade
Dirk Nowitzki
Kevin Garnett
Giannis Antetokounmpo
Nikola Jokic
Luka Doncic
Jayson Tatum
Anthony Edwards
Shai Gilgeous-Alexander
Victor Wembanyama
Ja Morant
Zion Williamson
Devin Booker
Donovan Mitchell
Trae Young
Tyrese Haliburton
Jalen Brunson
Paolo Banchero
Chet Holmgren
Anthony Davis
Joel Embiid
Jaylen Brown
Damian Lillard
Jimmy Butler
Kawhi Leonard
Kyrie Irving
Cooper Flagg
AJ Dybantsa
Darryn Peterson
Cameron Boozer
Caleb Wilson
Darius Acuff Jr
Ace Bailey
Dylan Harper
VJ Edgecombe
Stephon Castle
Alex Sarr
Zaccharie Risacher
Egor Demin
Kon Knueppel
Caitlin Clark`,
  "Hockey": `Wayne Gretzky
Mario Lemieux
Bobby Orr
Gordie Howe
Bobby Hull
Maurice Richard
Jean Beliveau
Patrick Roy
Martin Brodeur
Mark Messier
Steve Yzerman
Jaromir Jagr
Sidney Crosby
Alex Ovechkin
Connor McDavid
Teemu Selanne
Peter Forsberg
Ray Bourque
Nicklas Lidstrom
Dominik Hasek
Nathan MacKinnon
Auston Matthews
Cale Makar
Leon Draisaitl
David Pastrnak
Nikita Kucherov
Artemi Panarin
Kirill Kaprizov
Jack Hughes
Quinn Hughes
Miro Heiskanen
Elias Pettersson
Mitch Marner
William Nylander
Matthew Tkachuk
Brady Tkachuk
Igor Shesterkin
Andrei Vasilevskiy
Connor Bedard
Macklin Celebrini
Adam Fantilli
Matvei Michkov
Leo Carlsson
Logan Cooley
Will Smith
James Hagens
Porter Martone
Michael Misa`,
  "Soccer": `Pelé
Diego Maradona
Johan Cruyff
Zinedine Zidane
Ronaldo Nazario
Ronaldinho
David Beckham
Thierry Henry
Kaka
Andres Iniesta
Xavi
Wayne Rooney
Eric Cantona
Franz Beckenbauer
Ferenc Puskas
George Best
Garrincha
Paolo Maldini
Alessandro Del Piero
Roberto Baggio
Lionel Messi
Cristiano Ronaldo
Kylian Mbappe
Erling Haaland
Vinicius Jr
Jude Bellingham
Lamine Yamal
Neymar
Mohamed Salah
Harry Kane
Kevin De Bruyne
Phil Foden
Bukayo Saka
Jamal Musiala
Florian Wirtz
Pedri
Rodri
Federico Valverde
Rafael Leao
Victor Osimhen
Lautaro Martinez
Cole Palmer
Dominik Szoboszlai
Endrick
Estevao
Pau Cubarsi
Désiré Doué
Warren Zaire-Emery
Kenan Yildiz
Franco Mastantuono
Arda Guler
Ethan Nwaneri
Leny Yoro`,
  "F1": `Michael Schumacher
Ayrton Senna
Lewis Hamilton
Max Verstappen
Fernando Alonso
Sebastian Vettel
Juan Manuel Fangio
Alain Prost
Niki Lauda
Nigel Mansell
Nelson Piquet
Jackie Stewart
Jim Clark
Gilles Villeneuve
Kimi Raikkonen
Charles Leclerc
Lando Norris
Oscar Piastri
George Russell
Carlos Sainz
Andrea Kimi Antonelli
Oliver Bearman
Isack Hadjar
Gabriel Bortoleto
Franco Colapinto
Liam Lawson`,
  "WWE": `The Rock
Dwayne Johnson
Stone Cold Steve Austin
Hulk Hogan
John Cena
The Undertaker
Shawn Michaels
Bret Hart
Ric Flair
Triple H
Randy Savage
Ultimate Warrior
Andre the Giant
Bruno Sammartino
Mick Foley
Eddie Guerrero
Rey Mysterio
Chris Jericho
Kurt Angle
Brock Lesnar
Roman Reigns
Cody Rhodes
CM Punk
Randy Orton
Seth Rollins
Drew McIntyre
Gunther
Jey Uso
Jimmy Uso
The Miz
LA Knight
Rhea Ripley
Becky Lynch
Bianca Belair
Charlotte Flair
Alexa Bliss
Bayley
Liv Morgan
Iyo Sky
Jade Cargill`,
  "MMA/Boxing": `Conor McGregor
Jon Jones
Georges St-Pierre
Anderson Silva
Khabib Nurmagomedov
Islam Makhachev
Amanda Nunes
Ronda Rousey
Israel Adesanya
Alex Pereira
Francis Ngannou
Nate Diaz
Nick Diaz
Brock Lesnar
Daniel Cormier
Jose Aldo
Max Holloway
Charles Oliveira
Dustin Poirier
Justin Gaethje
Jiri Prochazka
Tom Aspinall
Ilia Topuria
Sean O'Malley
Alex Volkanovski
Khamzat Chimaev
Shavkat Rakhmonov
Paddy Pimblett
Bo Nickal
Muhammad Ali
Mike Tyson
Floyd Mayweather
Manny Pacquiao
Sugar Ray Leonard
Sugar Ray Robinson
Joe Louis
Rocky Marciano
Jack Dempsey
George Foreman
Joe Frazier
Oscar De La Hoya
Roy Jones Jr
Roberto Duran
Julio Cesar Chavez
Marvin Hagler
Thomas Hearns
Evander Holyfield
Lennox Lewis
Canelo Alvarez
Naoya Inoue
Oleksandr Usyk
Terence Crawford
Gervonta Davis
Shakur Stevenson
Devin Haney
Ryan Garcia
Jaron Ennis
Jesse Rodriguez`,
  "Golf": `Tiger Woods
Jack Nicklaus
Arnold Palmer
Ben Hogan
Bobby Jones
Sam Snead
Gary Player
Tom Watson
Phil Mickelson
Greg Norman
Seve Ballesteros
Nick Faldo
Ernie Els
Rory McIlroy
Jordan Spieth
Justin Thomas
Scottie Scheffler
Jon Rahm
Bryson DeChambeau
Xander Schauffele
Viktor Hovland
Collin Morikawa
Brooks Koepka
Nelly Korda
Lydia Ko
Annika Sorenstam
Michelle Wie
Caitlin Clark
Ludvig Aberg
Akshay Bhatia`,
  "Pokemon": `Pikachu
Charizard
Mew
Mewtwo
Umbreon
Eevee
Lugia
Ho-Oh
Rayquaza
Gengar
Blastoise
Venusaur
Celebi
Espeon
Sylveon
Gyarados
Dragonite
Greninja
Giratina
Dialga
Palkia
Arceus
Snorlax
Alakazam
Gardevoir
Tyranitar
Darkrai
Deoxys
Latias
Latios
Kyogre
Groudon
Jirachi
Shining Magikarp
Magikarp
Ditto
Mimikyu
Lucario
Zeraora
Leafeon
Glaceon
Vaporeon
Jolteon
Flareon
Sneasel
Jolteon’`,
  "Magic: The Gathering": `Black Lotus
Mox Sapphire
Mox Jet
Mox Ruby
Mox Pearl
Mox Emerald
Time Walk
Ancestral Recall
Timetwister
Underground Sea
Volcanic Island
Tropical Island
Tundra
Badlands
Bayou
Savannah
Scrubland
Taiga
Plateau
The Tabernacle at Pendrell Vale
Gaea's Cradle
Serra's Sanctum
Mishra's Workshop
Bazaar of Baghdad
Library of Alexandria
Candelabra of Tawnos
The One Ring
Ragavan
Sheoldred
Orcish Bowmasters
Mana Crypt
Mana Vault
Force of Will
Fierce Guardianship
Jeweled Lotus
Dockside Extortionist
Demonic Tutor
Vampiric Tutor
Rhystic Study
Smothering Tithe
Doubling Season
Cavern of Souls
Ancient Tomb
Force of Negation
The One Ring 1/1
Serialized
Serialized Ring
Sol Ring
Special Guest
Masterpiece
Expeditions
Judge Promo
Reserved List
Alpha
Beta
Unlimited
Arabian Nights
Antiquities
Legends
The Dark`,
  "Yu-Gi-Oh!": `Blue-Eyes White Dragon
Dark Magician
Dark Magician Girl
Red-Eyes Black Dragon
Exodia
Blue-Eyes Ultimate Dragon
Red-Eyes Dark Dragoon
Stardust Dragon
Black Rose Dragon
Harpie's Feather Duster
Black Luster Soldier
Chaos Emperor Dragon
Cyber Dragon
Dark Armed Dragon
Elemental HERO
Rainbow Dragon
Number 39: Utopia
Slifer the Sky Dragon
Obelisk the Tormentor
The Winged Dragon of Ra
Ash Blossom & Joyous Spring
Pot of Greed
Maxx "C"
Effect Veiler
Ghost Ogre & Snow Rabbit`,
  "One Piece": `Monkey D. Luffy
Roronoa Zoro
Nami
Portgas D. Ace
Shanks
Boa Hancock
Trafalgar Law
Marshall D. Teach
Blackbeard
Sabo
Tony Tony Chopper
Sanji
Usopp
Nico Robin
Vinsmoke Sanji
Yamato
Trafalgar D. Water Law
Donquixote Doflamingo
Edward Newgate
Whitebeard
Kaido
Charlotte Linlin
Big Mom
Gol D. Roger
Silvers Rayleigh
Dracule Mihawk
Buggy
Jewelry Bonney
Monkey D. Dragon`,
  "Disney Lorcana": `Mickey Mouse
Minnie Mouse
Elsa
Stitch
Cinderella
Mulan
Maleficent
Simba
Belle
Beast
Ariel
Rapunzel
Tinker Bell
Genie
Aladdin
Jasmine
Hades
Ursula
Scar
Captain Hook
Peter Pan
Donald Duck
Daisy Duck
Goofy
Jafar
Cruella de Vil
Robin Hood
Hercules
Pocahontas
Moana
Enchanted
Iconic
D23
Promo
Serialized
1/1
First Chapter
First Edition`,
};

const parseTerms = (value) => {
  const seen = new Set();
  return value.split(/\r?\n/).map((term) => term.trim()).filter((term) => {
    const key = term.normalize("NFKC").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const CATEGORY_SEARCH_TERMS = Object.freeze(Object.fromEntries(
  Object.entries(RAW_CATEGORY_SEARCH_TERMS).map(([category, value]) => [
    category,
    Object.freeze(parseTerms(value)),
  ])
));

const BASE_TERM_SEARCH_BUDGET = 8;
const MAX_TERM_SEARCH_BUDGET = 14;

/**
 * Select a bounded round-robin batch of category terms.
 * Each feed page advances through the full list before paging eBay results.
 */
export function selectCategoryTermBatches(
  categories,
  offset = 0,
  pageSize = 20,
  resultLimit = 20,
) {
  const uniqueCategories = [...new Set(categories || [])]
    .filter((category) => CATEGORY_SEARCH_TERMS[category]?.length);
  if (!uniqueCategories.length) return {};

  const budget = Math.min(
    MAX_TERM_SEARCH_BUDGET,
    Math.max(BASE_TERM_SEARCH_BUDGET, uniqueCategories.length),
  );
  const allocation = new Map(uniqueCategories.map((category) => [category, 0]));
  for (let index = 0; index < budget; index += 1) {
    const category = uniqueCategories[index % uniqueCategories.length];
    allocation.set(category, allocation.get(category) + 1);
  }

  const pageIndex = Math.floor(
    Math.max(0, Number(offset) || 0) / Math.max(1, Number(pageSize) || 20),
  );
  const safeResultLimit = Math.max(1, Number(resultLimit) || 20);

  return Object.fromEntries(uniqueCategories.map((category) => {
    const terms = CATEGORY_SEARCH_TERMS[category];
    const termsPerPage = Math.min(allocation.get(category), terms.length);
    const batchCount = Math.ceil(terms.length / termsPerPage);
    const batchIndex = pageIndex % batchCount;
    const eBayPage = Math.floor(pageIndex / batchCount);
    const start = batchIndex * termsPerPage;
    return [category, {
      terms: terms.slice(start, start + termsPerPage),
      offset: eBayPage * safeResultLimit,
    }];
  }));
}