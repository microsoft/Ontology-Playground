export interface OrganizationPack {
  id: string;
  name: string;
  description: string;
  dashboardTitle: string;
  dashboardSubtitle: string;
  disclaimer: string;
  defaultView: string;
  dataFile: string;
  rdfXml: string;
}

export interface OrganizationPackRegistry {
  generatedAt: string;
  defaultPackId: string;
  packs: OrganizationPack[];
}
