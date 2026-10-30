export type CharacterId = "kocken" | "psykologen" | "tradgardaren" | "huset";

export type Character = {
  id: CharacterId;
  name: string;
  color: string;
  glow: string;
  example: string;
};

export const CHARACTERS: Character[] = [
  { id: "kocken", name: "Kocken", color: "#F5C542", glow: "rgba(245, 197, 66, 0.55)", example: "Vilket vin passar till entrecôte?" },
  { id: "psykologen", name: "Psykologen", color: "#F27BB5", glow: "rgba(242, 123, 181, 0.55)", example: "Hur säger jag nej till min chef?" },
  { id: "tradgardaren", name: "Trädgårdaren", color: "#5FCB7A", glow: "rgba(95, 203, 122, 0.55)", example: "När ska jag beskära äppelträden?" },
  { id: "huset", name: "Huset", color: "#7C93B8", glow: "rgba(124, 147, 184, 0.55)", example: "Hur byter jag en packning i kranen?" },
];

export function isCharacterId(v: unknown): v is CharacterId {
  return typeof v === "string" && CHARACTERS.some((c) => c.id === v);
}
