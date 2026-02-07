export const clients = [
  { id: 1, name: "Alpen Haus Ski Center", accountNumber: "26131417347", region: "Mid Atlantic", type: "Ski Shop (Off Site)", city: "Warwick", state: "NY" },
  { id: 2, name: "Alpin Haus", accountNumber: "26129806636", region: "Mid Atlantic", type: "Ski Shop (Off Site)", city: "Amsterdam", state: "NY" },
  { id: 3, name: "Alpine Valley WI", accountNumber: "26128073758", region: "Midwest", type: "Resort", city: "East Troy", state: "WI" },
  { id: 4, name: "Andes Tower Hills", accountNumber: "26130890265", region: "Midwest", type: "Resort", city: "Kensington", state: "MN" },
  { id: 5, name: "Angel Fire Resort", accountNumber: "26124721453", region: "Rockies", type: "Resort", city: "Angel Fire", state: "NM" },
  { id: 6, name: "Angles Sports Ski Board and Fly Shop", accountNumber: "26133608842", region: "Rockies", type: "Ski Shop (Off Site)", city: "Herber City", state: "UT" },
  { id: 7, name: "Arizona Snowbowl", accountNumber: "26128568597", region: "Rockies", type: "Resort", city: "Flagstaff", state: "AZ" },
  { id: 8, name: "Backcountry Essentials", accountNumber: "26130426778", region: "PNW", type: "Ski Shop (Off Site)", city: "Bellingham", state: "WA" },
  { id: 9, name: "Base Mountain Sports", accountNumber: "26127455283", region: "Rockies", type: "Ski Shop (Off Site)", city: "Breckenridge", state: "CO" },
  { id: 10, name: "Bear Valley Rental / Chains Required", accountNumber: "26129341523", region: "PNW", type: "Resort", city: "Bear Valley", state: "CA" },
  { id: 11, name: "Berkshire East", accountNumber: "26133608833", region: "New England", type: "Resort", city: "Charlemont", state: "MA" },
  { id: 12, name: "Bill's Ski Rentals", accountNumber: "26127919641", region: "Rockies", type: "Ski Shop (Off Site)", city: "Winter Park", state: "CO" },
  { id: 13, name: "Black Tie Boone", accountNumber: "26178979840", region: "Southeast", type: "Ski Shop (Off Site)", city: "Boone", state: "NC" },
  { id: 14, name: "Black Tie Breckenridge", accountNumber: "26125523844", region: "Rockies", type: "Chain", city: "Breckenridge", state: "CO" },
  { id: 15, name: "Black Tie Schweitzer", accountNumber: "26134073111", region: "PNW", type: "Ski Shop (Off Site)", city: "Sandpoint", state: "ID" },
  { id: 16, name: "Black Tie Whitefish", accountNumber: "26128878245", region: "Rockies", type: "Ski Shop (Off Site)", city: "Whitefish", state: "MT" },
  { id: 17, name: "Blauer's Board Shop", accountNumber: "26134381105", region: "Midwest", type: "Ski Shop (Off Site)", city: "St. Cloud", state: "MN" },
  { id: 18, name: "Board Paradise", accountNumber: "26128568606", region: "Rockies", type: "Ski Shop (Off Site)", city: "Durango", state: "CO" },
  { id: 19, name: "Bolton Valley Resort", accountNumber: "26131107421", region: "New England", type: "Resort", city: "Bolton Valley", state: "VT" },
  { id: 20, name: "Bridger Bowl", accountNumber: "26133453171", region: "Rockies", type: "Resort", city: "Bozeman", state: "MT" },
  { id: 21, name: "Cannonsburg Ski Area", accountNumber: "26132502307", region: "Midwest", type: "Resort", city: "Belmont", state: "MI" },
  { id: 22, name: "Crystal Mountain Resort", accountNumber: "26124567121", region: "PNW", type: "Resort", city: "Crystal Mountain", state: "WA" },
  { id: 23, name: "Dodge Ridge", accountNumber: "26129032373", region: "PNW", type: "Resort", city: "Pinecrest", state: "CA" },
  { id: 24, name: "Grand Targhee Resort", accountNumber: "26125834530", region: "Rockies", type: "Resort SARA Group", city: "Alta", state: "WY" },
  { id: 25, name: "Hyland Hills Ski Area", accountNumber: "26130426797", region: "Midwest", type: "Resort", city: "Bloomington", state: "MN" },
];

export const seasons = [
  { id: "us-2024-2025", label: "US 2024-2025", country: "US", year: "2024-2025" },
  { id: "ca-2024-2025", label: "CA 2024-2025", country: "CA", year: "2024-2025" },
  { id: "us-2025-2026", label: "US 2025-2026", country: "US", year: "2025-2026" },
  { id: "ca-2025-2026", label: "CA 2025-2026", country: "CA", year: "2025-2026" },
  { id: "us-2026-2027", label: "US 2026-2027", country: "US", year: "2026-2027" },
  { id: "ca-2026-2027", label: "CA 2026-2027", country: "CA", year: "2026-2027" },
];

const rentalItems = ["Rental Upgraded Boards", "Rental Beginner Boards", "Rental Boots", "Rental Bindings"];
const retailItems = ["Retail Boards", "Retail Boots", "Retail Bindings"];

export const orders = [
  // US 2025-2026 season orders
  { id: 1, clientId: 1, seasonId: "us-2025-2026", orderType: "Rental", rentalItems: ["Rental Upgraded Boards"], orderNumber: "E6951 - 127440", closeDate: "2/28/2025", stage: "Closed - Won", total: 993.60 },
  { id: 2, clientId: 2, seasonId: "us-2025-2026", orderType: "Rental", rentalItems: ["Rental Upgraded Boards", "Rental Boots", "Rental Bindings"], orderNumber: "E8349", closeDate: "12/5/2025", stage: "Closed - Won", total: 3584.00 },
  { id: 3, clientId: 3, seasonId: "us-2025-2026", orderType: "Rental", rentalItems: ["Rental Bindings"], orderNumber: "E9206", closeDate: "1/12/2026", stage: "Closed - Won", total: 259.20 },
  { id: 4, clientId: 4, seasonId: "us-2025-2026", orderType: "Retail", retailItems: ["Retail Bindings"], orderNumber: "6599 - 126829", closeDate: "2/13/2025", stage: "Closed - Won", total: 282.00 },
  { id: 5, clientId: 4, seasonId: "us-2025-2026", orderType: "Rental", rentalItems: ["Rental Bindings"], orderNumber: "E6598 - 126825", closeDate: "2/13/2025", stage: "Closed - Won", total: 383.40 },
  { id: 6, clientId: 5, seasonId: "us-2025-2026", orderType: "Retail", retailItems: ["Retail Boards", "Retail Bindings"], orderNumber: "5760 - 125769", closeDate: "1/29/2025", stage: "Closed - Won", total: 4854.00 },
  { id: 7, clientId: 5, seasonId: "us-2025-2026", orderType: "Rental", rentalItems: ["Rental Beginner Boards", "Rental Boots", "Rental Bindings"], orderNumber: "125930", closeDate: "1/28/2025", stage: "Closed - Won", total: 36178.20 },
  { id: 8, clientId: 6, seasonId: "us-2025-2026", orderType: "Rental", rentalItems: ["Rental Beginner Boards", "Rental Upgraded Boards"], orderNumber: "E8253", closeDate: "12/2/2025", stage: "Closed - Won", total: 993.60 },
  { id: 9, clientId: 7, seasonId: "us-2025-2026", orderType: "Rental", rentalItems: ["Rental Boots"], orderNumber: "6822 - 127186", closeDate: "2/22/2025", stage: "Closed - Won", total: 1957.50 },
  { id: 10, clientId: 8, seasonId: "us-2025-2026", orderType: "Retail", retailItems: ["Retail Bindings"], orderNumber: "6901 - 127320", closeDate: "2/25/2025", stage: "Closed - Won", total: 3117.50 },
  { id: 11, clientId: 8, seasonId: "us-2025-2026", orderType: "Retail", retailItems: ["Retail Boots", "Retail Bindings"], orderNumber: "127319", closeDate: "2/25/2025", stage: "Closed - Won", total: 4422.00 },
  { id: 12, clientId: 8, seasonId: "us-2025-2026", orderType: "Rental", rentalItems: ["Rental Upgraded Boards", "Rental Bindings"], orderNumber: "E6938 - 127424", closeDate: "2/27/2025", stage: "Closed - Won", total: 3348.00 },
  { id: 13, clientId: 10, seasonId: "us-2025-2026", orderType: "Rental", rentalItems: ["Rental Upgraded Boards"], orderNumber: "6594 - 126820", closeDate: "2/13/2025", stage: "Closed - Won", total: 4554.00 },
  { id: 14, clientId: 11, seasonId: "us-2025-2026", orderType: "Rental", rentalItems: ["Rental Beginner Boards", "Rental Upgraded Boards", "Rental Boots", "Rental Bindings"], orderNumber: "E6540 - 126826", closeDate: "2/13/2025", stage: "Closed - Won", total: 22651.20 },
  { id: 15, clientId: 11, seasonId: "us-2025-2026", orderType: "Retail", retailItems: ["Retail Bindings"], orderNumber: "E3798", closeDate: "2/21/2025", stage: "Closed - Won", total: 777.60 },
  { id: 16, clientId: 12, seasonId: "us-2025-2026", orderType: "Rental", rentalItems: ["Rental Beginner Boards", "Rental Boots"], orderNumber: "E8861", closeDate: "12/31/2025", stage: "Closed - Won", total: 1060.00 },
  { id: 17, clientId: 9, seasonId: "us-2025-2026", orderType: "Rental", rentalItems: ["Rental Upgraded Boards", "Rental Boots"], orderNumber: "117262", closeDate: "2/15/2024", stage: "Closed - Won", total: 15217.20 },
  { id: 18, clientId: 19, seasonId: "us-2025-2026", orderType: "Rental", rentalItems: ["Rental Beginner Boards", "Rental Boots", "Rental Bindings"], orderNumber: "117644", closeDate: "2/2/2024", stage: "Closed - Won", total: 1782.00 },
  { id: 19, clientId: 20, seasonId: "us-2025-2026", orderType: "Rental", rentalItems: ["Rental Upgraded Boards", "Rental Boots", "Rental Bindings"], orderNumber: "117410", closeDate: "2/2/2024", stage: "Closed - Won", total: 9142.20 },
  // US 2024-2025 season
  { id: 20, clientId: 1, seasonId: "us-2024-2025", orderType: "Rental", rentalItems: ["Rental Upgraded Boards"], orderNumber: "118167", closeDate: "2/15/2024", stage: "Closed - Won", total: 1555.20 },
  { id: 21, clientId: 2, seasonId: "us-2024-2025", orderType: "Rental", rentalItems: ["Rental Upgraded Boards", "Rental Boots"], orderNumber: "118359", closeDate: "2/19/2024", stage: "Closed - Won", total: 42687.00 },
  { id: 22, clientId: 4, seasonId: "us-2024-2025", orderType: "Rental", rentalItems: ["Rental Bindings"], orderNumber: "118981", closeDate: "3/15/2024", stage: "Closed - Won", total: 507.60 },
  { id: 23, clientId: 5, seasonId: "us-2024-2025", orderType: "Rental", rentalItems: ["Rental Beginner Boards", "Rental Boots", "Rental Bindings"], orderNumber: "118924", closeDate: "3/12/2024", stage: "Closed - Won", total: 16437.60 },
  { id: 24, clientId: 7, seasonId: "us-2024-2025", orderType: "Rental", rentalItems: ["Rental Boots"], orderNumber: "118201", closeDate: "2/15/2024", stage: "Closed - Won", total: 9720.00 },
  { id: 25, clientId: 11, seasonId: "us-2024-2025", orderType: "Rental", rentalItems: ["Rental Beginner Boards", "Rental Upgraded Boards", "Rental Boots"], orderNumber: "117202", closeDate: "1/29/2024", stage: "Closed - Won", total: 18122.80 },
  // CA 2025-2026
  { id: 26, clientId: 21, seasonId: "ca-2025-2026", orderType: "Rental", rentalItems: ["Rental Upgraded Boards", "Rental Boots"], orderNumber: "CA-4521", closeDate: "3/1/2025", stage: "Closed - Won", total: 8450.00 },
  { id: 27, clientId: 22, seasonId: "ca-2025-2026", orderType: "Rental", rentalItems: ["Rental Beginner Boards", "Rental Bindings"], orderNumber: "CA-4588", closeDate: "3/15/2025", stage: "Closed - Won", total: 12340.00 },
  { id: 28, clientId: 23, seasonId: "ca-2025-2026", orderType: "Retail", retailItems: ["Retail Boards", "Retail Bindings"], orderNumber: "CA-4601", closeDate: "2/28/2025", stage: "Closed - Won", total: 5670.00 },
];

export const commissions = [
  { id: 1, clientId: 1, seasonId: "us-2025-2026", due: 49.68, payStatus: "paid", amountPaid: 49.68, paidDate: "2/5/2026", amountRemaining: 0 },
  { id: 2, clientId: 2, seasonId: "us-2025-2026", due: 179.20, payStatus: "unpaid", amountPaid: 0, paidDate: null, amountRemaining: 179.20 },
  { id: 3, clientId: 3, seasonId: "us-2025-2026", due: 12.96, payStatus: "unpaid", amountPaid: 0, paidDate: null, amountRemaining: 12.96 },
  { id: 4, clientId: 4, seasonId: "us-2025-2026", due: 33.27, payStatus: "paid", amountPaid: 33.27, paidDate: "10/13/2025", amountRemaining: 0 },
  { id: 5, clientId: 5, seasonId: "us-2025-2026", due: 2051.61, payStatus: "partial", amountPaid: 8.91, paidDate: "1/14/2026", amountRemaining: 2042.70 },
  { id: 6, clientId: 6, seasonId: "us-2025-2026", due: 49.68, payStatus: "unpaid", amountPaid: 0, paidDate: null, amountRemaining: 49.68 },
  { id: 7, clientId: 7, seasonId: "us-2025-2026", due: 97.88, payStatus: "unpaid", amountPaid: 0, paidDate: null, amountRemaining: 97.88 },
  { id: 8, clientId: 8, seasonId: "us-2025-2026", due: 544.38, payStatus: "paid", amountPaid: 544.38, paidDate: "2/5/2026", amountRemaining: 0 },
  { id: 9, clientId: 9, seasonId: "us-2025-2026", due: 760.86, payStatus: "unpaid", amountPaid: 0, paidDate: null, amountRemaining: 760.86 },
  { id: 10, clientId: 10, seasonId: "us-2025-2026", due: 227.70, payStatus: "unpaid", amountPaid: 0, paidDate: null, amountRemaining: 227.70 },
  { id: 11, clientId: 11, seasonId: "us-2025-2026", due: 1171.44, payStatus: "unpaid", amountPaid: 0, paidDate: null, amountRemaining: 1171.44 },
  { id: 12, clientId: 12, seasonId: "us-2025-2026", due: 53.00, payStatus: "paid", amountPaid: 53.00, paidDate: "1/14/2026", amountRemaining: 0 },
  { id: 13, clientId: 19, seasonId: "us-2025-2026", due: 300.78, payStatus: "unpaid", amountPaid: 0, paidDate: null, amountRemaining: 300.78 },
  { id: 14, clientId: 20, seasonId: "us-2025-2026", due: 964.80, payStatus: "unpaid", amountPaid: 0, paidDate: null, amountRemaining: 964.80 },
  // 2024-2025
  { id: 15, clientId: 1, seasonId: "us-2024-2025", due: 77.76, payStatus: "paid", amountPaid: 77.76, paidDate: "9/25/2024", amountRemaining: 0 },
  { id: 16, clientId: 2, seasonId: "us-2024-2025", due: 33.05, payStatus: "paid", amountPaid: 33.05, paidDate: "9/25/2024", amountRemaining: 0 },
  { id: 17, clientId: 4, seasonId: "us-2024-2025", due: 25.38, payStatus: "paid", amountPaid: 25.38, paidDate: "9/25/2024", amountRemaining: 0 },
  { id: 18, clientId: 5, seasonId: "us-2024-2025", due: 821.88, payStatus: "paid", amountPaid: 821.88, paidDate: "9/25/2024", amountRemaining: 0 },
  { id: 19, clientId: 7, seasonId: "us-2024-2025", due: 567.00, payStatus: "partial", amountPaid: 474.56, paidDate: "10/6/2024", amountRemaining: 92.44 },
  { id: 20, clientId: 11, seasonId: "us-2024-2025", due: 906.14, payStatus: "paid", amountPaid: 906.14, paidDate: "9/25/2024", amountRemaining: 0 },
  // CA 2025-2026
  { id: 21, clientId: 21, seasonId: "ca-2025-2026", due: 422.50, payStatus: "paid", amountPaid: 422.50, paidDate: "4/15/2025", amountRemaining: 0 },
  { id: 22, clientId: 22, seasonId: "ca-2025-2026", due: 617.00, payStatus: "unpaid", amountPaid: 0, paidDate: null, amountRemaining: 617.00 },
  { id: 23, clientId: 23, seasonId: "ca-2025-2026", due: 283.50, payStatus: "paid", amountPaid: 283.50, paidDate: "4/1/2025", amountRemaining: 0 },
];

export const regions = ["Rockies", "PNW", "Southeast", "Mid Atlantic", "New England", "Midwest", "So Cal", "Ontario"];
export const accountTypes = ["Ski Shop (Off Site)", "Resort", "Resort SARA Group", "Chain"];
