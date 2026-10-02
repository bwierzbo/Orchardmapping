/**
 * Picking windows for the varieties the library had nothing on.
 *
 * Dates are for maritime western Washington -- the Olympic rain shadow,
 * not eastern Washington and not England. An English cider apple picked in
 * late October at home comes off here in late September; a Virginia apple
 * comes off later here than in Virginia. Where a variety's home literature
 * gives one date, the date below is the maritime Pacific Northwest one.
 *
 * `confidence` is not decoration. It is the difference between a variety
 * whose season is well documented and widely grown here, one placed from
 * its type and parentage, and one that is a local seedling nobody has
 * written down. A "poor" row is a starting point for the grower to
 * correct, not an answer.
 *
 * `ripensHere: false` means the season runs out first. That is a real
 * answer and more useful than a date -- Pink Lady wants heat this
 * coastline does not have, and a pomegranate will not colour up at all.
 */

export type ReferenceConfidence = 'good' | 'fair' | 'poor';

export interface HarvestReference {
  variety: string;
  species: string;
  /** Picking window start and end, [month, day], in maritime western WA. */
  start: [number, number];
  end: [number, number];
  confidence: ReferenceConfidence;
  /** False when this coastline does not give it enough season. */
  ripensHere?: false;
  note?: string;
}

export const HARVEST_REFERENCE: HarvestReference[] = [
  // ─── Apples ──────────────────────────────────────────────────────────
  { variety: 'Duchess of Oldenburg', species: 'apple', start: [8, 5], end: [8, 20], confidence: 'good',
    note: 'One of the earliest apples grown here; cooks before it keeps.' },
  { variety: 'Sops of Wine', species: 'apple', start: [8, 10], end: [8, 30], confidence: 'good',
    note: 'Early, red-fleshed-staining; picks over a long spell rather than at once.' },
  { variety: 'Almata Sweet', species: 'apple', start: [8, 15], end: [9, 5], confidence: 'fair',
    note: 'Almata-type red-fleshed crab; early and does not hang.' },
  { variety: 'Niedzwetzkyana', species: 'apple', start: [8, 20], end: [9, 10], confidence: 'fair',
    note: 'The red-fleshed species crab behind most red-flesh breeding.' },
  { variety: 'Geneva Crab', species: 'apple', start: [8, 25], end: [9, 15], confidence: 'good',
    note: 'Red-fleshed crab, early; good colour for blending.' },
  { variety: 'Gala', species: 'apple', start: [9, 5], end: [9, 20], confidence: 'good' },
  { variety: 'Royal Gala', species: 'apple', start: [9, 5], end: [9, 20], confidence: 'good' },
  { variety: 'Red gala', species: 'apple', start: [9, 5], end: [9, 20], confidence: 'good' },
  { variety: 'Bolero', species: 'apple', start: [9, 10], end: [9, 25], confidence: 'fair',
    note: 'Columnar; crops light and early on the spur.' },
  { variety: 'Mountain Rose', species: 'apple', start: [9, 15], end: [10, 5], confidence: 'fair',
    note: 'Red-fleshed; colour holds best picked before it softens.' },
  { variety: "Hudson's Golden Gem", species: 'apple', start: [9, 25], end: [10, 15], confidence: 'good',
    note: 'Russet, nutty; hangs well and sweetens on the tree.' },
  { variety: 'Mother', species: 'apple', start: [10, 1], end: [10, 15], confidence: 'good',
    note: 'American Mother; aromatic, picks mid-autumn here.' },
  { variety: 'Cinnamon Spice', species: 'apple', start: [10, 1], end: [10, 20], confidence: 'fair' },
  { variety: 'Puget Spice', species: 'apple', start: [10, 5], end: [10, 25], confidence: 'good',
    note: 'WSU Mount Vernon release, bred for this climate; a cider crab.' },
  { variety: 'Burford Red', species: 'apple', start: [10, 1], end: [10, 20], confidence: 'poor',
    note: 'Burford is a Virginia family of varieties; placed by type, not by record.' },
  { variety: 'Belle de Jardin', species: 'apple', start: [10, 1], end: [10, 20], confidence: 'poor',
    note: 'French name, little documented here. Correct this from your own picking.' },
  { variety: 'Winter Red Flesh', species: 'apple', start: [10, 15], end: [11, 5], confidence: 'poor',
    note: 'Late red-flesh; may not colour fully in a cool year here.' },
  { variety: 'Old Rome', species: 'apple', start: [10, 15], end: [11, 1], confidence: 'fair',
    note: 'Rome Beauty type; very late, a cooking apple that wants hanging.' },
  { variety: 'Finn', species: 'apple', start: [9, 20], end: [10, 10], confidence: 'poor',
    note: 'No published record found; placed mid-season pending your own observation.' },
  { variety: 'Pink Lady', species: 'apple', start: [11, 1], end: [11, 20], confidence: 'good',
    ripensHere: false,
    note: 'Cripps Pink needs roughly 200 days and far more heat than this coastline gives. Expect it green and sharp most years.' },

  { variety: 'Discovery', species: 'apple', start: [8, 10], end: [8, 28], confidence: 'good',
    note: 'Early English apple; bruises easily and will not keep — pick and use.' },
  { variety: 'Chehalis', species: 'apple', start: [9, 1], end: [9, 20], confidence: 'good',
    note: 'Raised in Chehalis, Washington — a maritime variety on home ground, and scab-resistant.' },
  { variety: 'Winter Banana', species: 'apple', start: [10, 5], end: [10, 25], confidence: 'good',
    note: 'Late, aromatic; a common pollinizer. Picks before the first hard frosts.' },
  { variety: "Roger's Red", species: 'apple', start: [9, 20], end: [10, 10], confidence: 'poor',
    note: 'No published record found under this name; placed mid-season pending your own picking.' },

  // ─── Pears ───────────────────────────────────────────────────────────
  { variety: 'Red Bartlett', species: 'pear', start: [8, 15], end: [8, 31], confidence: 'good',
    note: 'Pick hard and ripen off the tree, as with all European pears.' },
  { variety: 'Rescue', species: 'pear', start: [9, 1], end: [9, 15], confidence: 'good',
    note: 'Pacific Northwest variety; reliable here.' },
  { variety: 'Orcas', species: 'pear', start: [9, 5], end: [9, 20], confidence: 'good',
    note: 'Raised on Orcas Island — bred for exactly this climate.' },
  { variety: 'Comice', species: 'pear', start: [9, 25], end: [10, 10], confidence: 'good',
    note: 'Doyenné du Comice; late, and wants cold storage to finish.' },
  { variety: 'Concorde', species: 'pear', start: [9, 10], end: [9, 30], confidence: 'good',
    note: 'Conference x Doyenne du Comice, East Malling 1977. OSU lists it for western Oregon and Washington at September — England picks it in late October and the hot-interior PNW crop from late August, so neither applies here. Long and tapered like Conference rather than round like Comice.' },
  { variety: 'Pear', species: 'pear', start: [9, 1], end: [9, 25], confidence: 'poor',
    note: 'Unidentified. Mid-season placeholder for a European pear.' },

  { variety: 'Yellow Bartlett', species: 'pear', start: [8, 15], end: [9, 1], confidence: 'good',
    note: 'The standard Bartlett. Pick hard and green; it ripens off the tree.' },
  { variety: 'Asian pear', species: 'pear', start: [8, 20], end: [9, 20], confidence: 'fair',
    note: 'Unnamed Asian pear. Unlike European pears these ripen ON the tree — pick when they taste ready.' },

  // ─── Plums ───────────────────────────────────────────────────────────
  { variety: 'Methley', species: 'plum', start: [7, 10], end: [7, 25], confidence: 'good',
    note: 'Japanese type, the earliest plum here.' },
  { variety: 'Satsuma', species: 'plum', start: [8, 10], end: [8, 25], confidence: 'good' },
  { variety: 'Golden Transparent', species: 'plum', start: [9, 1], end: [9, 15], confidence: 'fair',
    note: 'Gage type; ripens translucent and will not hang once ready.' },
  { variety: 'Italian Prune', species: 'plum', start: [9, 5], end: [9, 20], confidence: 'good',
    note: 'The standard PNW prune plum; freestone when properly ripe.' },
  { variety: 'Italian Plum', species: 'plum', start: [9, 5], end: [9, 20], confidence: 'good' },
  { variety: 'French Plum', species: 'plum', start: [9, 10], end: [9, 25], confidence: 'fair',
    note: "Agen type, grown for drying; wants to hang until it wrinkles." },

  // ─── Cherries ────────────────────────────────────────────────────────
  { variety: 'Rainier', species: 'cherry', start: [7, 1], end: [7, 15], confidence: 'good',
    note: 'Bred at WSU Prosser. Splits in rain — pick ahead of a wet spell.' },
  { variety: 'Stella', species: 'cherry', start: [7, 10], end: [7, 22], confidence: 'good',
    note: 'Self-fertile; the usual pollinator here.' },
  { variety: 'Lapins', species: 'cherry', start: [7, 15], end: [7, 30], confidence: 'good',
    note: 'Self-fertile, later than Stella, more rain-tolerant.' },
  { variety: '6-Way Cherry', species: 'cherry', start: [6, 25], end: [8, 5], confidence: 'fair',
    note: 'Multi-graft: the window is the whole spread of its six varieties, not one picking.' },

  // ─── Blueberries ─────────────────────────────────────────────────────
  { variety: 'Duke', species: 'blueberry', start: [7, 1], end: [7, 20], confidence: 'good',
    note: 'Early highbush; concentrated crop.' },
  { variety: 'Patriot', species: 'blueberry', start: [7, 10], end: [7, 30], confidence: 'good' },
  { variety: 'Bluejay', species: 'blueberry', start: [7, 20], end: [8, 10], confidence: 'good' },
  { variety: 'Chandler', species: 'blueberry', start: [8, 1], end: [9, 10], confidence: 'good',
    note: 'Picks over six weeks — the longest season of any highbush.' },

  // ─── Raspberries ─────────────────────────────────────────────────────
  { variety: 'Tulameen', species: 'raspberry', start: [7, 1], end: [7, 25], confidence: 'good',
    note: 'Floricane; the PNW standard.' },
  { variety: 'Cascade Delight', species: 'raspberry', start: [7, 5], end: [7, 30], confidence: 'good',
    note: 'Bred at WSU Puyallup for root rot tolerance in wet ground.' },
  { variety: 'Heritage', species: 'raspberry', start: [9, 1], end: [10, 10], confidence: 'good',
    note: 'Primocane — the autumn crop is the one worth having here.' },
  { variety: 'Bremerton', species: 'raspberry', start: [7, 5], end: [7, 30], confidence: 'poor',
    note: 'Local seedling name; placed as a summer floricane pending observation.' },
  { variety: 'Old Bremerton', species: 'raspberry', start: [7, 5], end: [7, 30], confidence: 'poor',
    note: 'Local seedling name; placed as a summer floricane pending observation.' },

  // ─── Blackberries ────────────────────────────────────────────────────
  { variety: 'Arapaho', species: 'blackberry', start: [7, 10], end: [8, 1], confidence: 'good',
    note: 'Thornless erect, early.' },
  { variety: 'Prime-Ark Freedom', species: 'blackberry', start: [7, 15], end: [9, 20], confidence: 'fair',
    note: 'Primocane-fruiting: a summer crop then an autumn one. Window spans both.' },
  { variety: 'Triple Crown', species: 'blackberry', start: [8, 1], end: [8, 25], confidence: 'good',
    note: 'Thornless semi-erect; heavy cropper.' },
  { variety: "Hall's Beauty", species: 'blackberry', start: [8, 5], end: [8, 30], confidence: 'fair',
    note: 'Ornamental-flowered thornless; crops lighter than Triple Crown.' },
  { variety: 'Chester', species: 'blackberry', start: [8, 20], end: [9, 20], confidence: 'good',
    note: 'The latest blackberry; needs the season to hold to finish.' },

  // ─── Currants and gooseberry ─────────────────────────────────────────
  { variety: 'Red Currant', species: 'currant', start: [7, 5], end: [7, 25], confidence: 'good' },
  { variety: 'Consort', species: 'currant', start: [7, 10], end: [7, 30], confidence: 'good',
    note: 'Blackcurrant, rust-immune. Picks as a strig once evenly black.' },
  { variety: 'Crandall', species: 'currant', start: [8, 1], end: [8, 25], confidence: 'fair',
    note: 'Clove currant; ripens unevenly over weeks.' },
  { variety: 'Captivator', species: 'gooseberry', start: [7, 10], end: [8, 1], confidence: 'good',
    note: 'Nearly thornless; pick green for cooking or leave to redden.' },

  // ─── Other fruit ─────────────────────────────────────────────────────
  { variety: 'Scarlet Ovation', species: 'huckleberry', start: [8, 10], end: [9, 10], confidence: 'fair',
    note: 'Evergreen huckleberry selection; picks slowly over a month.' },
  { variety: 'Smyrna', species: 'quince', start: [10, 5], end: [10, 30], confidence: 'good',
    note: 'Pick when the down rubs off and it turns gold; it will not soften on the tree.' },
  { variety: 'Pineapple', species: 'quince', start: [10, 5], end: [10, 30], confidence: 'good' },
  { variety: 'Medlar', species: 'medlar', start: [11, 1], end: [11, 30], confidence: 'good',
    note: 'Picked hard after the first frosts and bletted indoors — the one fruit here that is not ready when it looks it.' },
  { variety: 'Giant Fuyu', species: 'persimmon', start: [10, 25], end: [11, 20], confidence: 'fair',
    note: 'Non-astringent Fuyu type, but marginal on this coastline: it wants heat into November that the rain shadow rarely gives.' },
  { variety: 'Pomegranate', species: 'pomegranate', start: [10, 15], end: [11, 15], confidence: 'good',
    ripensHere: false,
    note: 'Needs a long hot summer to colour and sweeten. It will flower here and may set, but the fruit will not finish.' },

  // ─── Nuts: gathered, not picked from a bloom ─────────────────────────
  { variety: 'Theta', species: 'hazelnut', start: [9, 10], end: [10, 5], confidence: 'good',
    note: 'OSU release, blight-resistant. Gathered as the husks release and nuts drop.' },
  { variety: 'York', species: 'hazelnut', start: [9, 10], end: [10, 5], confidence: 'good',
    note: 'OSU pollinizer; drops with the main crop.' },
  { variety: 'Du Chilly', species: 'hazelnut', start: [9, 20], end: [10, 15], confidence: 'fair',
    note: 'Long-nutted old variety, later and blight-susceptible.' },
];
