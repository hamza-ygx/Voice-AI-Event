export type CharacterId = "kocken" | "psykologen" | "tradgardaren" | "huset";

export type Character = {
  id: CharacterId;
  name: string;
  color: string;
  glow: string;
  example: string;
  examples: string[];
  speechRate: number;
};

export const CHARACTERS: Character[] = [
  {
    id: "kocken",
    name: "Kocken",
    color: "#F5C542",
    glow: "rgba(245, 197, 66, 0.55)",
    example: "Vilket vin passar till entrecôte?",
    examples: [
      "Vilket vin passar till entrecôte?",
      "Vad lagar jag av kyckling och ris?",
      "Hur får jag riktigt krispig ugnspotatis?",
      "Vad är en bra höstgryta till helgen?",
    ],
    speechRate: 1.05,
  },
  {
    id: "psykologen",
    name: "Psykologen",
    color: "#F27BB5",
    glow: "rgba(242, 123, 181, 0.55)",
    example: "Hur säger jag nej till min chef?",
    examples: [
      "Hur säger jag nej till min chef?",
      "Mitt barn vägrar somna tidigt, vad gör jag?",
      "Hur hinner jag med allt inför jul?",
      "Hur pratar jag med min tonåring?",
    ],
    speechRate: 0.92,
  },
  {
    id: "tradgardaren",
    name: "Trädgårdaren",
    color: "#5FCB7A",
    glow: "rgba(95, 203, 122, 0.55)",
    example: "När ska jag beskära äppelträden?",
    examples: [
      "När ska jag beskära äppelträden?",
      "Varför gulnar mina tomater?",
      "Vad gör jag i trädgården i november?",
      "Hur blir jag av med mossan i gräsmattan?",
    ],
    speechRate: 0.97,
  },
  {
    id: "huset",
    name: "Huset",
    color: "#7C93B8",
    glow: "rgba(124, 147, 184, 0.55)",
    example: "Hur byter jag en packning i kranen?",
    examples: [
      "Hur byter jag en packning i kranen?",
      "Det luktar från avloppet, vad gör jag?",
      "Hur luftar jag elementen?",
      "Det drar från fönstret, hur tätar jag?",
    ],
    speechRate: 1.03,
  },
];

export function isCharacterId(v: unknown): v is CharacterId {
  return typeof v === "string" && CHARACTERS.some((c) => c.id === v);
}
