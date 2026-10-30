// Ikon project. Database menyimpan kunci teks (PROJECT_ICONS); komponen ini
// menerjemahkannya ke ikon lucide. Kunci tak dikenal memakai ikon bawaan.

import {
  Building2Icon,
  FactoryIcon,
  HammerIcon,
  HardHatIcon,
  HouseIcon,
  LandmarkIcon,
  StoreIcon,
  TreesIcon,
  TruckIcon,
  WarehouseIcon,
  WrenchIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { DEFAULT_PROJECT_ICON, type ProjectIconKey } from "../constants";

const ICONS: Record<ProjectIconKey, LucideIcon> = {
  building: Building2Icon,
  home: HouseIcon,
  hammer: HammerIcon,
  "hard-hat": HardHatIcon,
  factory: FactoryIcon,
  store: StoreIcon,
  warehouse: WarehouseIcon,
  truck: TruckIcon,
  wrench: WrenchIcon,
  zap: ZapIcon,
  landmark: LandmarkIcon,
  trees: TreesIcon,
};

export function ProjectIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name as ProjectIconKey] ?? ICONS[DEFAULT_PROJECT_ICON];
  return <Icon className={className} aria-hidden />;
}
