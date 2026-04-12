export type SelectableTraitKey = "color" | "country_of_origin";
export type TraitOption = { value: string; label: string };

const COLOR_OPTIONS = [
  ["black", "Black"],
  ["white", "White"],
  ["blue", "Blue"],
  ["red", "Red"],
  ["green", "Green"],
  ["silver", "Silver"],
  ["gold", "Gold"],
  ["brown", "Brown"],
  ["grey", "Grey"],
  ["navy", "Navy"],
  ["orange", "Orange"],
  ["pink", "Pink"],
  ["purple", "Purple"],
  ["yellow", "Yellow"],
  ["multi", "Multi"],
  ["cream", "Cream"],
] as const;

const COUNTRY_OPTIONS_WITH_CODES = [
  ["AF", "Afghanistan"],
  ["AL", "Albania"],
  ["DZ", "Algeria"],
  ["AD", "Andorra"],
  ["AO", "Angola"],
  ["AG", "Antigua and Barbuda"],
  ["AR", "Argentina"],
  ["AM", "Armenia"],
  ["AU", "Australia"],
  ["AT", "Austria"],
  ["AZ", "Azerbaijan"],
  ["BS", "Bahamas"],
  ["BH", "Bahrain"],
  ["BD", "Bangladesh"],
  ["BB", "Barbados"],
  ["BY", "Belarus"],
  ["BE", "Belgium"],
  ["BZ", "Belize"],
  ["BJ", "Benin"],
  ["BT", "Bhutan"],
  ["BO", "Bolivia"],
  ["BA", "Bosnia and Herzegovina"],
  ["BW", "Botswana"],
  ["BR", "Brazil"],
  ["BN", "Brunei"],
  ["BG", "Bulgaria"],
  ["BF", "Burkina Faso"],
  ["BI", "Burundi"],
  ["CV", "Cabo Verde"],
  ["KH", "Cambodia"],
  ["CM", "Cameroon"],
  ["CA", "Canada"],
  ["CF", "Central African Republic"],
  ["TD", "Chad"],
  ["CL", "Chile"],
  ["CN", "China"],
  ["CO", "Colombia"],
  ["KM", "Comoros"],
  ["CG", "Congo"],
  ["CR", "Costa Rica"],
  ["CI", "Côte d'Ivoire"],
  ["HR", "Croatia"],
  ["CU", "Cuba"],
  ["CY", "Cyprus"],
  ["CZ", "Czech Republic"],
  ["CD", "Democratic Republic of the Congo"],
  ["DK", "Denmark"],
  ["DJ", "Djibouti"],
  ["DM", "Dominica"],
  ["DO", "Dominican Republic"],
  ["EC", "Ecuador"],
  ["EG", "Egypt"],
  ["SV", "El Salvador"],
  ["GQ", "Equatorial Guinea"],
  ["ER", "Eritrea"],
  ["EE", "Estonia"],
  ["SZ", "Eswatini"],
  ["ET", "Ethiopia"],
  ["FJ", "Fiji"],
  ["FI", "Finland"],
  ["FR", "France"],
  ["GA", "Gabon"],
  ["GM", "Gambia"],
  ["GE", "Georgia"],
  ["DE", "Germany"],
  ["GH", "Ghana"],
  ["GR", "Greece"],
  ["GD", "Grenada"],
  ["GT", "Guatemala"],
  ["GN", "Guinea"],
  ["GW", "Guinea-Bissau"],
  ["GY", "Guyana"],
  ["HT", "Haiti"],
  ["HN", "Honduras"],
  ["HU", "Hungary"],
  ["IS", "Iceland"],
  ["IN", "India"],
  ["ID", "Indonesia"],
  ["IR", "Iran"],
  ["IQ", "Iraq"],
  ["IE", "Ireland"],
  ["IL", "Israel"],
  ["IT", "Italy"],
  ["JM", "Jamaica"],
  ["JP", "Japan"],
  ["JO", "Jordan"],
  ["KZ", "Kazakhstan"],
  ["KE", "Kenya"],
  ["KI", "Kiribati"],
  ["KW", "Kuwait"],
  ["KG", "Kyrgyzstan"],
  ["LA", "Laos"],
  ["LV", "Latvia"],
  ["LB", "Lebanon"],
  ["LS", "Lesotho"],
  ["LR", "Liberia"],
  ["LY", "Libya"],
  ["LI", "Liechtenstein"],
  ["LT", "Lithuania"],
  ["LU", "Luxembourg"],
  ["MG", "Madagascar"],
  ["MW", "Malawi"],
  ["MY", "Malaysia"],
  ["MV", "Maldives"],
  ["ML", "Mali"],
  ["MT", "Malta"],
  ["MH", "Marshall Islands"],
  ["MR", "Mauritania"],
  ["MU", "Mauritius"],
  ["MX", "Mexico"],
  ["FM", "Micronesia"],
  ["MD", "Moldova"],
  ["MC", "Monaco"],
  ["MN", "Mongolia"],
  ["ME", "Montenegro"],
  ["MA", "Morocco"],
  ["MZ", "Mozambique"],
  ["MM", "Myanmar"],
  ["NA", "Namibia"],
  ["NR", "Nauru"],
  ["NP", "Nepal"],
  ["NL", "Netherlands"],
  ["NZ", "New Zealand"],
  ["NI", "Nicaragua"],
  ["NE", "Niger"],
  ["NG", "Nigeria"],
  ["KP", "North Korea"],
  ["MK", "North Macedonia"],
  ["NO", "Norway"],
  ["OM", "Oman"],
  ["PK", "Pakistan"],
  ["PW", "Palau"],
  ["PS", "Palestine"],
  ["PA", "Panama"],
  ["PG", "Papua New Guinea"],
  ["PY", "Paraguay"],
  ["PE", "Peru"],
  ["PH", "Philippines"],
  ["PL", "Poland"],
  ["PT", "Portugal"],
  ["QA", "Qatar"],
  ["RO", "Romania"],
  ["RU", "Russia"],
  ["RW", "Rwanda"],
  ["KN", "Saint Kitts and Nevis"],
  ["LC", "Saint Lucia"],
  ["VC", "Saint Vincent and the Grenadines"],
  ["WS", "Samoa"],
  ["SM", "San Marino"],
  ["ST", "Sao Tome and Principe"],
  ["SA", "Saudi Arabia"],
  ["SN", "Senegal"],
  ["RS", "Serbia"],
  ["SC", "Seychelles"],
  ["SL", "Sierra Leone"],
  ["SG", "Singapore"],
  ["SK", "Slovakia"],
  ["SI", "Slovenia"],
  ["SB", "Solomon Islands"],
  ["SO", "Somalia"],
  ["ZA", "South Africa"],
  ["KR", "South Korea"],
  ["SS", "South Sudan"],
  ["ES", "Spain"],
  ["LK", "Sri Lanka"],
  ["SD", "Sudan"],
  ["SR", "Suriname"],
  ["SE", "Sweden"],
  ["CH", "Switzerland"],
  ["SY", "Syria"],
  ["TW", "Taiwan"],
  ["TJ", "Tajikistan"],
  ["TZ", "Tanzania"],
  ["TH", "Thailand"],
  ["TL", "Timor-Leste"],
  ["TG", "Togo"],
  ["TO", "Tonga"],
  ["TT", "Trinidad and Tobago"],
  ["TN", "Tunisia"],
  ["TR", "Turkey"],
  ["TM", "Turkmenistan"],
  ["TV", "Tuvalu"],
  ["UG", "Uganda"],
  ["UA", "Ukraine"],
  ["AE", "United Arab Emirates"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
  ["UY", "Uruguay"],
  ["UZ", "Uzbekistan"],
  ["VU", "Vanuatu"],
  ["VA", "Vatican City"],
  ["VE", "Venezuela"],
  ["VN", "Vietnam"],
  ["YE", "Yemen"],
  ["ZM", "Zambia"],
  ["ZW", "Zimbabwe"],
] as const;

const COLOR_LABELS = new Map<string, string>(COLOR_OPTIONS.map(([value, label]) => [value, label]));
const COUNTRY_LABELS = new Map<string, string>(COUNTRY_OPTIONS_WITH_CODES.map(([, name]) => [name, name]));
const COUNTRY_CODE_TO_NAME = new Map<string, string>(COUNTRY_OPTIONS_WITH_CODES.map(([code, name]) => [code.toLowerCase(), name]));
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States",
  "united states of america": "United States",
  uk: "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",
  uae: "United Arab Emirates",
  "south korea": "South Korea",
  "republic of korea": "South Korea",
  "korea, republic of": "South Korea",
  "north korea": "North Korea",
  "democratic people's republic of korea": "North Korea",
  russia: "Russia",
  czechia: "Czech Republic",
  ivorycoast: "Côte d'Ivoire",
  "ivory coast": "Côte d'Ivoire",
};

const COLOR_ALIASES: Record<string, string> = {
  gray: "grey",
  grey: "grey",
  multicolor: "multi",
  "multi-color": "multi",
  "multi color": "multi",
  offwhite: "cream",
  "off-white": "cream",
  offwhitee: "cream",
  beige: "cream",
  tan: "cream",
  khaki: "cream",
};

export const SELECTABLE_TRAIT_OPTIONS: Record<SelectableTraitKey, TraitOption[]> = {
  color: COLOR_OPTIONS.map(([value, label]) => ({ value, label })),
  country_of_origin: COUNTRY_OPTIONS_WITH_CODES.map(([, label]) => ({ value: label, label })),
};

export function isSelectableTraitKey(key: string): key is SelectableTraitKey {
  return key === "color" || key === "country_of_origin";
}

function normalizeColorValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  const mapped = COLOR_ALIASES[normalized] ?? normalized;
  return COLOR_LABELS.has(mapped) ? mapped : value.trim();
}

function normalizeCountryValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();
  const fromCode = COUNTRY_CODE_TO_NAME.get(lower);
  if (fromCode) return fromCode;

  const squashed = lower.replace(/[.]/g, "").replace(/\s+/g, " ");
  const fromAlias = COUNTRY_ALIASES[squashed];
  if (fromAlias) return fromAlias;

  return COUNTRY_LABELS.has(trimmed) ? trimmed : trimmed;
}

export function normalizeSelectableTraitValue(key: SelectableTraitKey, value: string | null | undefined) {
  if (!value) return "";
  return key === "color" ? normalizeColorValue(value) : normalizeCountryValue(value);
}

export function normalizeEditableTraits(traits: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(traits).map(([key, value]) => [
      key,
      isSelectableTraitKey(key) ? normalizeSelectableTraitValue(key, value) : value,
    ])
  );
}

export function getSelectableTraitOptions(key: SelectableTraitKey) {
  return SELECTABLE_TRAIT_OPTIONS[key];
}

export function filterSelectableTraitOptions(key: SelectableTraitKey, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return getSelectableTraitOptions(key);

  return getSelectableTraitOptions(key).filter((option) =>
    option.label.toLowerCase().includes(normalizedQuery)
  );
}

export function getSelectableTraitLabel(key: SelectableTraitKey, value: string | null | undefined) {
  if (!value) return null;
  const normalizedValue = normalizeSelectableTraitValue(key, value);
  const match = getSelectableTraitOptions(key).find((option) => option.value === normalizedValue);
  return match?.label ?? value;
}

export function formatPublishFeedbackMessage(platform: string, error?: string) {
  const label = platform ? `${platform.charAt(0).toUpperCase()}${platform.slice(1)}` : "Publish";
  return `${label}: ${error ?? "Publish failed. Try again."}`;
}
