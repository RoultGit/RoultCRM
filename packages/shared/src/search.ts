export type SearchResultType = 'COMPANY' | 'CONTACT' | 'LEAD' | 'DEAL' | 'USER';

export interface SearchResultDTO {
  type: SearchResultType;
  id: string;
  label: string;
  sublabel: string | null;
  /** Ruta del frontend a la que lleva el resultado. */
  href: string;
}

export interface SearchResponseDTO {
  results: SearchResultDTO[];
}
