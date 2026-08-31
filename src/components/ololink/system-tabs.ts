import {
  Satellite,
  Plane,
  Drone,
  SatelliteDish,
  Search,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import type { RailId } from '@/hooks/use-ololink';

export const SYSTEM_TABS: {
  id: RailId;
  label: string;
  hint: string;
  icon: LucideIcon;
}[] = [
  { id: 'leo', label: 'LEO', hint: 'ข้อมูลดาวเทียม LEO ทั้งหมด', icon: Satellite },
  { id: 'haps', label: 'HAPS', hint: 'ข้อมูลแพลตฟอร์ม HAPS ทั้งหมด', icon: Plane },
  { id: 'drone', label: 'Drone', hint: 'ข้อมูลโดรนรีเลย์ทั้งหมด', icon: Drone },
  { id: 'ground', label: 'Ground', hint: 'ข้อมูลสถานีภาคพื้นดินทั้งหมด', icon: SatelliteDish },
  { id: 'search', label: 'Search', hint: 'ค้นหาอุปกรณ์ทุกประเภทอย่างรวดเร็ว', icon: Search },
  { id: 'settings', label: 'Settings', hint: 'การตั้งค่าของระบบทั้งหมด', icon: Settings2 },
];
