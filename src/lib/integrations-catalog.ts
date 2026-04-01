export interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  logo?: string;
  composioApp: string;
  toolCount: number;
  authSchemes?: string[];
}
