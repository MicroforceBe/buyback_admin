import {LayoutDashboard,ClipboardList,Wrench,Activity,Tags,Package,SlidersHorizontal,Upload,Settings,ArrowUpRight,ArrowRight,ChartNoAxesCombined,RotateCcw,Newspaper,ListTodo} from 'lucide-react';

const icons={dashboard:LayoutDashboard,leads:ClipboardList,refurb:Wrench,diagnostics:Activity,erp:Tags,catalog:Package,multipliers:SlidersHorizontal,uploads:Upload,settings:Settings,arrow:ArrowUpRight,next:ArrowRight,analytics:ChartNoAxesCombined,rma:RotateCcw,notes:Newspaper,backlog:ListTodo};
export type AdminIconName=keyof typeof icons;
export default function AdminIcon({name,size=20}:{name:AdminIconName;size?:number}){const Icon=icons[name];return <Icon size={size} strokeWidth={1.7} aria-hidden="true"/>;}

