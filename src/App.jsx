import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { supabase } from "./supabaseClient";
import logo from "./logo.jpg";
import loginBanner from "./login-banner.png";
import * as XLSX from "xlsx";
import heic2any from "heic2any";
import {
  LayoutGrid, ListChecks, Plus, LogOut, User, X, Trash2, Edit2, AlertTriangle, Calendar, Users, UserPlus, Menu, Camera, Upload, Image as ImageIcon, Sun, Moon, FolderOpen, FileText, Download,
  Globe, Settings, Wrench, Lightbulb, Target, Trophy, Clock, CheckCircle, ArrowLeft, Truck, BarChart2, PieChart as PieChartIcon
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const STATUS_COLOR = {
  "Not Started": "#6B7280",
  "In Progress": "#F2B705",
  Completed: "#3DA35D",
  "Awaiting Operator Analysis": "#3b82f6",
  "Escalated to Maintenance Supervisor": "#10b981",
  "Maintenance in Progress": "#8b5cf6",
  "Ready to Begin Production": "#ef4444"
};

const CHART_COLORS = [
  "#3DA35D", // Green
  "#F26430", // Orange
  "#007BFF", // Blue
  "#8E44AD", // Purple
  "#E74C3C", // Red
  "#16A085", // Teal
  "#F39C12", // Amber
  "#34495E", // Navy
  "#D35400", // Dark Orange
  "#2C3E50", // Dark Blue
  "#27AE60", // Medium Green
  "#2980B9", // Medium Blue
];

// Parses a single raw Supabase "tasks" row into the shape the UI expects.
// Shared by the initial fetch AND by realtime handlers, so a single
// insert/update/delete only ever needs to process one row instead of
// re-downloading the entire table.
function parseTaskRow(t) {
  let location = "";
  let assigneeName = "";
  let photos = t.photos || [];
  let description = t.description || "";
  let subTasks = t.subTasks || [];
  let breakdownTime = "";
  let breakdownEndTime = "";
  let machineryPart = t.machineryPart || t.machinery_part || "";
  let faultType = t.faultType || t.fault_type || "";
  let electricalFault = false;
  let mechanicalFault = false;
  let invoiceNo = t.invoiceNo || "";
  let serviceType = t.serviceType || "Service";
  let meterReading = t.meterReading || "";
  let serviceProvider = t.serviceProvider || "";
  let totalCost = t.totalCost || 0;
  let daysRequiredVal = Number(t.daysRequired) || 0;

  if (t.assignee && t.assignee.startsWith("VEHICLE_DATA ||| ")) {
    try {
      const vData = JSON.parse(t.assignee.substring(17));
      if (vData.invoiceNo !== undefined) invoiceNo = vData.invoiceNo;
      if (vData.serviceType !== undefined) serviceType = vData.serviceType;
      if (vData.meterReading !== undefined) meterReading = vData.meterReading;
      if (vData.serviceProvider !== undefined) serviceProvider = vData.serviceProvider;
      if (vData.totalCost !== undefined) totalCost = vData.totalCost;
      if (vData.photos !== undefined) photos = vData.photos;
      if (vData.description !== undefined) description = vData.description;
      if (vData.downHours !== undefined && vData.downHours !== null && !isNaN(Number(vData.downHours))) {
        daysRequiredVal = Number(vData.downHours);
      }
    } catch (e) { }
  } else if (t.assignee && t.assignee.includes(" ||| ")) {
    const parts = t.assignee.split(" ||| ");
    location = parts[0] || "";
    assigneeName = parts[1] || "";
    if (parts[2]) {
      try {
        photos = JSON.parse(parts[2]);
      } catch (e) {
        photos = [];
      }
    }
    description = parts[3] || "";
    if (parts[4]) {
      try {
        subTasks = JSON.parse(parts[4]);
      } catch (e) {
        subTasks = [];
      }
    }
    if (parts[5]) {
      try {
        const times = JSON.parse(parts[5]);
        breakdownTime = times.bTime || "";
        breakdownEndTime = times.eTime || "";
      } catch (e) { }
    }
    if (parts[6]) {
      try {
        const extra = JSON.parse(parts[6]);
        if (extra.machineryPart) machineryPart = extra.machineryPart;
        if (extra.faultType) faultType = extra.faultType;
        if (extra.electricalFault !== undefined) electricalFault = extra.electricalFault;
        if (extra.mechanicalFault !== undefined) mechanicalFault = extra.mechanicalFault;
        if (extra.downHours !== undefined && extra.downHours !== null && !isNaN(Number(extra.downHours))) {
          daysRequiredVal = Number(extra.downHours);
        }
      } catch (e) { }
    }
  } else {
    location = t.assignee || "";
    assigneeName = "";
  }

  if (!electricalFault && !mechanicalFault && faultType) {
    const fLower = faultType.toLowerCase();
    electricalFault = fLower.includes("electrical");
    mechanicalFault = fLower.includes("mechanical");
  }

  const cleanStartDate = t.startDate ? String(t.startDate).slice(0, 10) : null;
  const cleanEndDate = t.endDate ? String(t.endDate).slice(0, 10) : null;

  return {
    ...t,
    startDate: cleanStartDate,
    endDate: cleanEndDate,
    daysRequired: daysRequiredVal,
    progress: Number(t.progress) || 0,
    invoiceNo,
    serviceType,
    meterReading,
    serviceProvider,
    totalCost,
    machineryPart,
    faultType,
    electricalFault,
    mechanicalFault,
    breakdownTime: t.breakdownTime || breakdownTime,
    breakdownEndTime: t.breakdownEndTime || breakdownEndTime,
    location,
    assigneeName,
    photos,
    description,
    subTasks
  };
}

function isVehicleTaskRow(t) {
  return t && (t.projectToken === "vehicle" || t.projectToken === "vehicle-maintenance");
}

const ASSIGNEE_CHART_COLORS = [
  "#F59E0B", // Amber
  "#10B981", // Emerald
  "#EC4899", // Pink
  "#6366F1", // Indigo
  "#14B8A6", // Teal
  "#EF4444", // Red
];

const DEFAULT_NAMES = [
  "PUMP HOUSE AND OFFICE",
  "PUMP HOUSE & OFFICE",
  "MILK PLANT",
  "MILK SECTION",
  "WASTE WATER PLANT",
  "AIR CONDENSED COCONUT MILK UNIT",
  "AIR COOLING CONDENSED UNIT MILK",
  "DC/LOW FAT SECTION",
  "LOW FAT SECTION",
  "LOW FAT",
  "DRY SECTION",
  "DC SECTION",
  "YARA",
  "NEW OIL MILL",
  "YARD A B C",
  "YARD SECTION A",
  "YARD A",
  "YRAD SECTION A",
  "YRAD A",
  "YARD SECTION B",
  "YARD B",
  "YRAD SECTION B",
  "YRAD B",
  "YARD SECTION C",
  "YARD C",
  "YRAD SECTION C",
  "YRAD C",
  "WET A B C",
  "WET SECTION A",
  "WET A",
  "WET SECTION B",
  "WET B",
  "WET SECTION C",
  "WET C",
  "COCONUT SHELL BOILER",
  "FIRE WOOD BOILER",
  "Washrooms",
  "Living Quarters",
  "Creamed Coconut Plant",
  "Mill Garden"
];

const DEFAULT_PROJECT_NAMES = [
  "Transformer project",
  "New section D Project",
  "New chiller press and milk tanks",
  "waste water plant concreting",
  "Stores area construction Project",
  "canteen construction Project",
  "upgrading preventive maintenance plan",
  "factory Sustainability and energy"
];

const DEFAULT_INVENTORY_ITEMS = [
  "Drilling Machine C21",
  "Grinder A97",
  "Hobbing Machine J2",
  "Lathe A1",
  "Milling Machine B9",
  "Planer N2"
];

const WASTE_WATER_PLANT_MACHINERY = [
  "pump 1",
  "pump 2",
  "pump 3",
  "pump4"
];

const WET_SECTION_A_MACHINERY = [
  "Unloading lorry conveyor",
  "main coveyor",
  "small conveyor",
  "pre cutter",
  "table",
  "washing conveyor",
  "coconut water tank",
  "coconut water pump"
];

const WET_SECTION_B_MACHINERY = [
  "pre cutter",
  "b wet lorry loading conveyor"
];

const WET_SECTION_C_MACHINERY = [
  "section c to b wet conveyor",
  "peeling off machine"
];

const YARD_SECTION_A_MACHINERY = [
  "A yard main iloading coveyor",
  "yard left side conveyor belt",
  "yard right side conveyor belt",
  "hi pressure pump",
  "shell unloading conveyor",
  "deshelling machine 23"
];

const YARD_SECTION_B_MACHINERY = [
  "B yard coconut water tank",
  "cococnut wet tank agitator",
  "coconut conveyor loading belt",
  "coconut conveyor belt side",
  "hi pressure pump",
  "coconut shell removing machine",
  "coconut water pump"
];

const YARD_SECTION_C_MACHINERY = [
  "coconut water condensing unit 1",
  "coconut water condensing unit 2",
  "tank agitator",
  "cococnut water pumo",
  "coconut shell removing machine"
];

const NEW_OIL_MILL_MACHINERY = [
  "oil mill cutter",
  "cutter feeding conveyor",
  "dryer fan motor",
  "1 conveyer",
  "dryer motor",
  "2 conveyor",
  "3 conveyor",
  "1 kumar oil mill machine",
  "2 kumar oil mill machine",
  "nugaduwa oil expeller machine",
  "oil pump",
  "nugaduwa machines oil pump",
  "vibration moter",
  "oil tank agitator",
  "oil filter pump",
  "oil tank pump",
  "oil stock tank feed pump",
  "product out pump",
  "fire pump"
];

const COCONUT_SHELL_BOILER_MACHINERY = [
  "ID fan",
  "fd fan",
  "water feed pump",
  "screw pump",
  "screw conveyor",
  "shell cutter",
  "chemical pump",
  "cooling tower water feed pump 1",
  "cooling tower heat exhaust fan"
];

const FIRE_WOOD_BOILER_MACHINERY = [
  "Id fan",
  "FD fan",
  "water storke tank water pump",
  "feed water pump 1",
  "feed waterpump 2",
  "electric axe"
];

const PUMP_HOUSE_AND_OFFICE_MACHINERY = [
  "office",
  "main guard room",
  "1 main gate motor",
  "2 elder home",
  "3street light",
  "pump room",
  "main pump",
  "tube well",
  "other",
  "water pumps",
  "1 water pump",
  "2 filter system pump",
  "3 filter system blower",
  "waste water pump"
];

const LOW_FAT_MACHINERY = [
  "low fat dryer main fan",
  "conveyor 1",
  "dryer motor 1",
  "dryer motor 2",
  "dryer motor 3",
  "dryer motor 4",
  "dryer motor 5",
  "conveyor 2",
  "inspection table",
  "conveyor 3",
  "air compressor"
];

const DRY_SECTION_MACHINERY = [
  "dc conveyor 1",
  "dc conveyor 2",
  "dc cutter conveyor 3",
  "dc cutter",
  "conveyor 4",
  "dryer motor 1",
  "dryer motor 2",
  "dryer motor 3",
  "dryer motor 4",
  "conveyor 5",
  "inspection table",
  "conveyor 6",
  "Dc shifter",
  "vibrator bag 1",
  "bag vibrator 2",
  "dc exhaust fan 1",
  "dc exhaust fan 2",
  "dc exhaust fan 3",
  "dc exhaust fan 4",
  "dc dryer main fan motor",
  "dc exhaust fan 5"
];

const AIR_COOLING_MILK_MACHINERY = [
  "ice bank no 1",
  "chill water pump",
  "ice bank no 2",
  "ice bank no 3",
  "farm tank no 1",
  "farm tank no 2",
  "farm tank no5",
  "farm tank no6",
  "farm tank no 7",
  "ice bank 1 water pump",
  "ice bank 2 water pump",
  "1 tank agitator",
  "2 tank agitator",
  "3 tank agitator 1",
  "3 tank agitator 2",
  "4 tank agitator",
  "5 tank agitator",
  "6 tank agitator",
  "7 tank agitator",
  "ice bank 3 chiller",
  "milk hi pressure pump",
  "hydrulic pump",
  "hot water tank pump",
  "caustic tank pump",
  "caustic tank agitator",
  "cip pump",
  "product out pump",
  "water stock tank pump",
  "Tank number 7 water pump"
];

const MILK_PLANT_MACHINERY = [
  "A wet to milk plant conveyor",
  "milk main cutter",
  "steam blancher",
  "press 1 main motor",
  "press 1 corn motor",
  "steam blanch to press 2 conveyor",
  "press 2 and press 1 coconut powder side conv;",
  "bottom up conveyor",
  "exhaust fan 1",
  "exhaust fan 2",
  "small milk pump",
  "milk pump",
  "press 2 main motor",
  "press 2 conveyor",
  "corn motor press 2",
  "press 3 cutter feed conveyor'",
  "press 3 cutter motor",
  "press 3 steam blancher",
  "press 3 main motor",
  "corn motor press3",
  "press 1 to 2 to press3 long conveyor",
  "press3 to dc conveyor",
  "press 3 exhaust fan 1",
  "press3 exhaust fan 2"
];

const YARA_MACHINERY = [
  "yara conveyor",
  "yara cutter",
  "inspection table",
  "yara AC 3 phase",
  "yara freezer tank"
];

function getSectionDefaultMachinery(sectionName, type) {
  if (type !== "inventory" || !sectionName) return null;
  const s = sectionName.toLowerCase().trim();
  if (s.includes("waste water") || s.includes("wastewater")) {
    return WASTE_WATER_PLANT_MACHINERY;
  }
  const isWetA =
    (s.includes("wet section a") || s.includes("swet section a") || s.includes("wet a")) &&
    !s.includes("wet a b c") &&
    !s.includes("wet b") &&
    !s.includes("wet c");

  if (isWetA) {
    return WET_SECTION_A_MACHINERY;
  }

  const isWetB =
    (s.includes("wet section b") || s.includes("swet section b") || s.includes("wet b")) &&
    !s.includes("wet a b c") &&
    !s.includes("wet a") &&
    !s.includes("wet c");

  if (isWetB) {
    return WET_SECTION_B_MACHINERY;
  }

  const isWetC =
    (s.includes("wet section c") || s.includes("swet section c") || s.includes("wet c")) &&
    !s.includes("wet a b c") &&
    !s.includes("wet a") &&
    !s.includes("wet b");

  if (isWetC) {
    return WET_SECTION_C_MACHINERY;
  }
  const isYardA =
    (s.includes("yard a") || s.includes("yrad a") || s.includes("yard section a") || s.includes("yrad section a") || s.includes("a yard")) &&
    !s.includes("yard a b c") &&
    !s.includes("yrad a b c") &&
    !s.includes("yard b") &&
    !s.includes("yrad b") &&
    !s.includes("yard c") &&
    !s.includes("yrad c");

  if (isYardA) {
    return YARD_SECTION_A_MACHINERY;
  }

  const isYardB =
    (s.includes("yard b") || s.includes("yrad b") || s.includes("yard section b") || s.includes("yrad section b") || s.includes("b yard")) &&
    !s.includes("yard a b c") &&
    !s.includes("yrad a b c") &&
    !s.includes("yard a") &&
    !s.includes("yrad a") &&
    !s.includes("yard c") &&
    !s.includes("yrad c");

  if (isYardB) {
    return YARD_SECTION_B_MACHINERY;
  }

  const isYardC =
    (s.includes("yard c") || s.includes("yrad c") || s.includes("yard section c") || s.includes("yrad section c") || s.includes("c yard")) &&
    !s.includes("yard a b c") &&
    !s.includes("yrad a b c") &&
    !s.includes("yard a") &&
    !s.includes("yrad a") &&
    !s.includes("yard b") &&
    !s.includes("yrad b");

  if (isYardC) {
    return YARD_SECTION_C_MACHINERY;
  }

  const isYara = s.includes("yara") && !s.includes("yard") && !s.includes("yrad");
  if (isYara) {
    return YARA_MACHINERY;
  }
  if (s.includes("new oil mill") || s.includes("oil mill")) {
    return NEW_OIL_MILL_MACHINERY;
  }
  const isCoconutShellBoiler =
    s.includes("coconut shell boiler") ||
    s.includes("shell boiler") ||
    (s.includes("coconut") && s.includes("boiler"));

  if (isCoconutShellBoiler) {
    return COCONUT_SHELL_BOILER_MACHINERY;
  }

  if (s.includes("fire wood boiler") || s.includes("wood boiler") || s.includes("firewood boiler") || s.includes("boiler")) {
    return FIRE_WOOD_BOILER_MACHINERY;
  }

  const isPumpHouseAndOffice =
    s.includes("pump house") ||
    (s.includes("pump") && s.includes("office")) ||
    s.includes("office") ||
    s.includes("guard room");

  if (isPumpHouseAndOffice) {
    return PUMP_HOUSE_AND_OFFICE_MACHINERY;
  }
  if (s.includes("low fat")) {
    return LOW_FAT_MACHINERY;
  }
  if (s.includes("dry section") || s.includes("dc section") || s.includes("dry") || (s.includes("dc") && !s.includes("dc/low fat"))) {
    return DRY_SECTION_MACHINERY;
  }
  const isMilkPlant =
    (s.includes("milk plant") || s.includes("milk section") || s === "milk") &&
    !s.includes("air cooling") &&
    !s.includes("air condensed") &&
    !s.includes("condensed unit") &&
    !s.includes("coconut milk unit");

  if (isMilkPlant) {
    return MILK_PLANT_MACHINERY;
  }

  if (
    s.includes("air cooling") ||
    s.includes("air condensed") ||
    s.includes("air concerned") ||
    s.includes("aie cooline") ||
    s.includes("condensed unit milk") ||
    s.includes("coconut milk unit")
  ) {
    return AIR_COOLING_MILK_MACHINERY;
  }
  return null;
}

const DEFAULT_ASSIGNEES = [
  "LIYANAGE",
  "INDIKA",
  "ANANDA",
  "NISHANTHA",
  "MAHINDA/PALITHA",
  "NIMESH/KAMAL",
  "UMESH",
  "ALL TEAM",
  "SS Contractor",
  "Outsource",
  "JANITH"
];

const DEFAULT_PROJECT_ASSIGNEES = [
  "Engineering",
  "Procurement",
  "Production",
  "Thushara",
  "Asanka",
  "Outsource"
];

function statusOf(progress, token = "") {
  if (token === "inventory") {
    if (progress >= 100) return "Ready to Begin Production";
    if (progress >= 60) return "Maintenance in Progress";
    if (progress >= 30) return "Escalated to Maintenance Supervisor";
    return "Awaiting Operator Analysis";
  }
  if (progress >= 100) return "Completed";
  if (progress > 0) return "In Progress";
  return "Not Started";
}
function addDays(dateStr, days) {
  if (!dateStr) return "";
  const clean = String(dateStr).slice(0, 10);
  const numDays = Number(days) || 0;
  const d = new Date(clean + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + numDays);
  return d.toISOString().slice(0, 10);
}
function calcDaysBetween(sDate, eDate) {
  if (!sDate || !eDate) return 0;
  const s = new Date(String(sDate).slice(0, 10) + "T00:00:00");
  const e = new Date(String(eDate).slice(0, 10) + "T00:00:00");
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : 0;
}
function fmt(dateStr) {
  if (!dateStr) return "—";
  const clean = String(dateStr).slice(0, 10);
  const d = new Date(clean + "T00:00:00");
  if (isNaN(d.getTime())) return clean;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function exportToExcel(data, fileName, sheetName = "Report") {
  if (!data || !data.length) {
    alert("No data available to export.");
    return;
  }
  try {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const colWidths = Object.keys(data[0] || {}).map((key) => {
      const maxLen = Math.max(
        key.length,
        ...data.map((row) => String(row[key] !== undefined && row[key] !== null ? row[key] : "").length)
      );
      return { wch: Math.min(Math.max(maxLen + 3, 12), 60) };
    });
    ws["!cols"] = colWidths;

    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}_${todayStr()}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    console.error("Excel export failed:", e);
    alert("Could not export Excel file: " + (e.message || JSON.stringify(e)));
  }
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return { r: 59, g: 130, b: 246 };
  const clean = hex.replace("#", "");
  let num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 59, g: 130, b: 246 };
  if (clean.length === 3) {
    const r = ((num >> 8) & 0xf) * 17;
    const g = ((num >> 4) & 0xf) * 17;
    const b = (num & 0xf) * 17;
    return { r, g, b };
  }
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function darkenHex(hex, percent) {
  try {
    const { r, g, b } = hexToRgb(hex);
    const f = 1 - percent / 100;
    const nr = Math.max(0, Math.round(r * f));
    const ng = Math.max(0, Math.round(g * f));
    const nb = Math.max(0, Math.round(b * f));
    return `rgb(${nr}, ${ng}, ${nb})`;
  } catch (e) {
    return hex;
  }
}

function lightenHex(hex, percent) {
  try {
    const { r, g, b } = hexToRgb(hex);
    const f = percent / 100;
    const nr = Math.min(255, Math.round(r + (255 - r) * f));
    const ng = Math.min(255, Math.round(g + (255 - g) * f));
    const nb = Math.min(255, Math.round(b + (255 - b) * f));
    return `rgb(${nr}, ${ng}, ${nb})`;
  } catch (e) {
    return hex;
  }
}

function Custom3DBar(props) {
  const { x, y, width, height, fill, payload, dataKey } = props;
  if (!width || !height || height <= 0) return null;

  const barWidth = Math.min(width * 0.75, 42);
  const offsetX = x + (width - barWidth) / 2;
  const depthX = Math.min(barWidth * 0.25, 8);
  const depthY = 6;
  const topY = y;
  const bottomY = y + height;

  const sideColor = darkenHex(fill, 28);
  const topColor = lightenHex(fill, 40);

  const val = payload ? payload[dataKey || "avgProgress"] : null;
  let displayVal = "";
  if (val !== null && val !== undefined) {
    if (typeof val === "number") {
      if (dataKey === "totalHours") {
        displayVal = `${val}h`;
      } else if (dataKey === "totalCost") {
        const totalSum = payload?.totalSum || 0;
        if (totalSum > 0) {
          const pct = ((val / totalSum) * 100).toFixed(1);
          displayVal = `${pct.endsWith(".0") ? Math.round(Number(pct)) : pct}%`;
        } else {
          displayVal = "0%";
        }
      } else {
        displayVal = `${val}%`;
      }
    } else {
      displayVal = String(val);
    }
  }

  return (
    <g className="jd-3d-bar-group">
      {/* Front Face */}
      <rect
        x={offsetX}
        y={topY}
        width={barWidth}
        height={height}
        fill={fill}
        rx={2}
        ry={2}
      />
      {/* Right 3D Side Depth Face */}
      <path
        d={`M ${offsetX + barWidth} ${topY}
           L ${offsetX + barWidth + depthX} ${topY - depthY}
           L ${offsetX + barWidth + depthX} ${bottomY - depthY}
           L ${offsetX + barWidth} ${bottomY} Z`}
        fill={sideColor}
        opacity={0.88}
      />
      {/* Top 3D Isometric Cap */}
      <path
        d={`M ${offsetX} ${topY}
           L ${offsetX + depthX} ${topY - depthY}
           L ${offsetX + barWidth + depthX} ${topY - depthY}
           L ${offsetX + barWidth} ${topY} Z`}
        fill={topColor}
        opacity={0.95}
      />
      {/* Front Gloss Reflection */}
      <rect
        x={offsetX + 2}
        y={topY + 2}
        width={Math.max(barWidth * 0.22, 2)}
        height={Math.max(height - 4, 2)}
        fill="#ffffff"
        opacity={0.18}
        rx={1}
      />
      {/* Top Value Label */}
      {displayVal && (
        <text
          x={offsetX + barWidth / 2 + depthX / 2}
          y={topY - depthY - 7}
          fill="var(--text)"
          textAnchor="middle"
          fontSize="11.5"
          fontWeight="bold"
          fontFamily="'Oswald', sans-serif"
        >
          {displayVal}
        </text>
      )}
    </g>
  );
}

function CustomDarkTooltip({ active, payload, label, unit = "", valuePrefix = "" }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  const pData = item.payload || {};
  const name = label || pData.displayName || pData.name || pData.section || pData.assignee || "Item";
  const val = item.value !== undefined ? item.value : pData.avgProgress || pData.totalHours || pData.tasks || 0;
  const color = item.fill || item.color || pData.fill || "#38bdf8";

  const displayVal = typeof val === "number" && !Number.isInteger(val) ? val.toFixed(1) : val;

  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.94)",
        color: "#ffffff",
        padding: "6px 14px",
        borderRadius: "8px",
        fontSize: "12px",
        fontWeight: "600",
        boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
        pointerEvents: "none",
        backdropFilter: "blur(6px)",
        border: "1px solid rgba(255,255,255,0.18)",
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }}
    >
      <span
        style={{
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          boxShadow: `0 0 6px ${color}`
        }}
      />
      <span>
        {name}: <strong style={{ color: "#38bdf8" }}>{valuePrefix}{displayVal}{unit ? ` ${unit}` : ""}</strong>
      </span>
    </div>
  );
}

const INFOGRAPHIC_SLICER_PALETTE = [
  { id: "pink", top: "#EC407A", bottom: "#C2185B", icon: Globe },
  { id: "purple", top: "#7E57C2", bottom: "#512DA8", icon: Settings },
  { id: "teal", top: "#26C6DA", bottom: "#00796B", icon: Lightbulb },
  { id: "amber", top: "#FFCA28", bottom: "#F57F17", icon: Target },
  { id: "orange", top: "#FF7043", bottom: "#E64A19", icon: Trophy },
  { id: "blue", top: "#4FC3F7", bottom: "#0288D1", icon: Users },
  { id: "lime", top: "#9CCC65", bottom: "#558B2F", icon: FolderOpen },
  { id: "indigo", top: "#7986CB", bottom: "#303F9F", icon: Wrench },
];
function InfographicPieChart({
  data = [],
  dataKey = "value",
  nameKey = "name",
  centerTitle = "PIE INFOGRAPHIC",
  unit = "",
  onClick = null,
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [bloomKey, setBloomKey] = useState(0);

  useEffect(() => {
    setHoveredIndex(null);
    setBloomKey((prev) => prev + 1);
  }, [data, centerTitle]);

  const validData = useMemo(() => {
    return (data || []).filter((d) => (Number(d[dataKey]) || 0) > 0);
  }, [data, dataKey]);

  const totalValue = useMemo(() => {
    return validData.reduce((sum, d) => sum + (Number(d[dataKey]) || 0), 0);
  }, [validData, dataKey]);

  if (!validData || validData.length === 0 || totalValue === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-dim)", fontSize: "13px" }}>
        No data available
      </div>
    );
  }

  let currentAngle = -90;
  const slices = validData.map((item, idx) => {
    const val = Number(item[dataKey]) || 0;
    const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
    const angleSpan = (val / totalValue) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angleSpan;
    currentAngle = endAngle;

    const midAngle = startAngle + angleSpan / 2;
    const styleInfo = INFOGRAPHIC_SLICER_PALETTE[idx % INFOGRAPHIC_SLICER_PALETTE.length];
    const IconComponent = styleInfo.icon;

    return {
      ...item,
      val,
      pct,
      startAngle,
      endAngle,
      midAngle,
      angleSpan,
      gradId: `info-pie-grad-${idx}`,
      styleInfo,
      IconComponent,
      index: idx,
    };
  });

  const size = 360;
  const center = size / 2;
  const rIn = 58;
  const rBase = 114;
  const stepOut = 16;

  return (
    <div style={{ position: "relative", width: "100%", minHeight: "350px", display: "flex", justifyContent: "center", alignItems: "center", padding: "10px 0" }}>
      <style>{`
        @keyframes bloomPieContainer {
          0% {
            transform: scale(0.2) rotate(-45deg);
            opacity: 0;
          }
          65% {
            transform: scale(1.06) rotate(4deg);
            opacity: 0.95;
          }
          85% {
            transform: scale(0.98) rotate(-1deg);
            opacity: 1;
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }
        @keyframes bloomSliceItem {
          0% {
            transform: scale(0) rotate(-35deg);
            opacity: 0;
          }
          70% {
            transform: scale(1.08) rotate(3deg);
            opacity: 1;
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }
        @keyframes bloomCenterBadge {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          65% {
            transform: scale(1.12);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
      <svg
        key={bloomKey}
        viewBox={`0 0 ${size} ${size}`}
        style={{
          width: "100%",
          height: "auto",
          maxWidth: "360px",
          display: "block",
          margin: "0 auto",
          overflow: "visible",
          animation: "bloomPieContainer 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
          transformOrigin: `${center}px ${center}px`
        }}
      >
        <defs>
          {slices.map((s) => (
            <linearGradient key={s.gradId} id={s.gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={s.styleInfo.top} />
              <stop offset="100%" stopColor={s.styleInfo.bottom} />
            </linearGradient>
          ))}
          <filter id="info-badge-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#000000" floodOpacity="0.3" />
          </filter>
          <filter id="info-hover-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="7" floodColor="#000000" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Pinwheel Slices */}
        {slices.map((s) => {
          const isHovered = hoveredIndex === s.index;

          const r1 = rBase;
          const r2 = rBase + stepOut;

          const rad1 = (s.startAngle * Math.PI) / 180;
          const rad2 = (s.endAngle * Math.PI) / 180;

          const xIn1 = center + rIn * Math.cos(rad1);
          const yIn1 = center + rIn * Math.sin(rad1);
          const xIn2 = center + rIn * Math.cos(rad2);
          const yIn2 = center + rIn * Math.sin(rad2);

          const xOut1 = center + r1 * Math.cos(rad1);
          const yOut1 = center + r1 * Math.sin(rad1);
          const xOut2 = center + r2 * Math.cos(rad2);
          const yOut2 = center + r2 * Math.sin(rad2);

          const largeArc = s.angleSpan > 180 ? 1 : 0;
          const rAvg = (r1 + r2) / 2;

          const pathData = [
            `M ${xIn1.toFixed(2)} ${yIn1.toFixed(2)}`,
            `L ${xOut1.toFixed(2)} ${yOut1.toFixed(2)}`,
            `A ${rAvg.toFixed(2)} ${rAvg.toFixed(2)} 0 ${largeArc} 1 ${xOut2.toFixed(2)} ${yOut2.toFixed(2)}`,
            `L ${xIn2.toFixed(2)} ${yIn2.toFixed(2)}`,
            `A ${rIn.toFixed(2)} ${rIn.toFixed(2)} 0 ${largeArc} 0 ${xIn1.toFixed(2)} ${yIn1.toFixed(2)}`,
            `Z`
          ].join(" ");

          const radMid = (s.midAngle * Math.PI) / 180;
          const rText = rIn + (rAvg - rIn) * 0.58;
          const xText = center + rText * Math.cos(radMid);
          const yText = center + rText * Math.sin(radMid);

          const pctStr = `${Math.round(s.pct)}%`;
          const rawName = String(s[nameKey] || s.name || s.displayName || "").trim();
          const titleStr = rawName.toUpperCase();
          const IconComp = s.IconComponent;

          return (
            <g
              key={s.index}
              style={{
                cursor: onClick ? "pointer" : "default",
                transition: "transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)",
                transform: isHovered ? `scale(1.05)` : "scale(1)",
                transformOrigin: `${center}px ${center}px`,
                animation: `bloomSliceItem 0.75s cubic-bezier(0.34, 1.56, 0.64, 1) ${s.index * 0.07}s both`,
              }}
              onMouseEnter={() => setHoveredIndex(s.index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => onClick && onClick(s)}
            >
              <path
                d={pathData}
                fill={`url(#${s.gradId})`}
                stroke="#ffffff"
                strokeWidth="1.8"
                filter={isHovered ? "url(#info-hover-glow)" : undefined}
              />

              {s.angleSpan >= 12 && (
                <g transform={`translate(${xText.toFixed(2)}, ${yText.toFixed(2)})`}>
                  {s.angleSpan >= 25 && (
                    <g transform="translate(0, -18)">
                      <circle cx="0" cy="0" r="10" fill="rgba(255,255,255,0.25)" />
                      <g transform="translate(-6, -6)">
                        <IconComp size={12} color="#ffffff" />
                      </g>
                    </g>
                  )}

                  <text
                    x="0"
                    y={s.angleSpan >= 25 ? "0" : "-8"}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize={s.angleSpan < 30 ? "8.5px" : "10px"}
                    fontWeight="800"
                    style={{ letterSpacing: "0.4px", textShadow: "0px 1.5px 3px rgba(0,0,0,0.6)" }}
                  >
                    {titleStr.length > 13 ? titleStr.substring(0, 11) + "…" : titleStr}
                  </text>

                  <text
                    x="0"
                    y={s.angleSpan >= 25 ? "16" : "8"}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize={s.angleSpan < 30 ? "13px" : "16px"}
                    fontWeight="900"
                    style={{ textShadow: "0px 1.5px 4px rgba(0,0,0,0.7)" }}
                  >
                    {pctStr}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        <g
          filter="url(#info-badge-shadow)"
          style={{
            animation: "bloomCenterBadge 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) 0.18s both",
            transformOrigin: `${center}px ${center}px`
          }}
        >
          <circle cx={center} cy={center} r={rIn} fill="#ffffff" stroke="#e2e8f0" strokeWidth="5" />
          <circle cx={center} cy={center} r={rIn - 5} fill="#ffffff" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="3 3" />

          <text
            x={center}
            y={center - 7}
            textAnchor="middle"
            fill="#1e293b"
            fontSize="11px"
            fontWeight="900"
            style={{ letterSpacing: "1.2px", textTransform: "uppercase" }}
          >
            {centerTitle}
          </text>

          <text
            x={center}
            y={center + 10}
            textAnchor="middle"
            fill="#64748b"
            fontSize="9.5px"
            fontWeight="700"
          >
            TOTAL: {totalValue}{unit ? ` ${unit}` : ""}
          </text>
        </g>
      </svg>

      {hoveredIndex !== null && slices[hoveredIndex] && (
        <div
          style={{
            position: "absolute",
            bottom: "8px",
            background: "rgba(15, 23, 42, 0.94)",
            color: "#ffffff",
            padding: "6px 14px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: "600",
            boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
            pointerEvents: "none",
            zIndex: 20,
            backdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,0.18)",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: slices[hoveredIndex].styleInfo.top,
              display: "inline-block",
              boxShadow: "0 0 6px " + slices[hoveredIndex].styleInfo.top
            }}
          />
          <span>
            {slices[hoveredIndex][nameKey] || slices[hoveredIndex].name || slices[hoveredIndex].displayName || "Item"}:{" "}
            <strong style={{ color: "#38bdf8" }}>{slices[hoveredIndex].val} {unit}</strong> ({slices[hoveredIndex].pct.toFixed(1)}%)
          </span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [tasks, setTasks] = useState(() => {
    try {
      const cached = localStorage.getItem("cached-job-tasks");
      const parsed = cached ? JSON.parse(cached) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  });

  const [vehicleTasks, setVehicleTasks] = useState(() => {
    try {
      const cached = localStorage.getItem("cached-vehicle-maintenance-tasks");
      const parsed = cached ? JSON.parse(cached) : null;
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (e) { }
    return [];
  });

  async function saveVehicleTasks(nextList) {
    const prevList = vehicleTasks; // pre-update snapshot, for diffing
    setVehicleTasks(nextList);
    try {
      localStorage.setItem("cached-vehicle-maintenance-tasks", JSON.stringify(nextList));
    } catch (e) { }
    try {
      // Only rows that are new or whose object reference changed need to be
      // written back to Supabase - unmodified rows keep the same reference
      // (see call sites), so this avoids rewriting the entire table on
      // every save, which was the main driver of Supabase egress/writes.
      const prevById = new Map(prevList.map((t) => [t.id, t]));
      const changedList = nextList.filter((t) => prevById.get(t.id) !== t);

      const nextIds = new Set(nextList.map((t) => t.id));
      const removedIds = prevList.filter((t) => !nextIds.has(t.id)).map((t) => t.id);
      if (removedIds.length > 0) {
        await supabase.from("tasks").delete().in("id", removedIds);
      }

      const dbRows = changedList.map((t) => {
        const vehicleExtraPayload = JSON.stringify({
          invoiceNo: t.invoiceNo || "",
          serviceType: t.serviceType || "Service",
          meterReading: t.meterReading || "",
          serviceProvider: t.serviceProvider || "",
          totalCost: t.totalCost ? Number(t.totalCost) : 0,
          photos: t.photos || [],
          description: t.description || "",
          downHours: t.daysRequired !== undefined && t.daysRequired !== null && !isNaN(Number(t.daysRequired)) ? Number(t.daysRequired) : 0
        });

        const assigneeString = `VEHICLE_DATA ||| ${vehicleExtraPayload}`;

        return {
          id: t.id,
          project: t.project || "",
          projectToken: "vehicle",
          task: t.task || "",
          assignee: assigneeString,
          startDate: t.startDate ? String(t.startDate).slice(0, 10) : null,
          endDate: t.endDate ? String(t.endDate).slice(0, 10) : (t.startDate ? String(t.startDate).slice(0, 10) : null),
          daysRequired: Math.round(Number(t.daysRequired) || 0),
          progress: Math.round(Number(t.progress) || 0),
          createdBy: t.createdBy || session?.name || "",
          createdAt: t.createdAt || new Date().toISOString(),
          updatedAt: t.updatedAt || new Date().toISOString()
        };
      });

      if (dbRows.length > 0) {
        const chunkSize = 25;
        for (let i = 0; i < dbRows.length; i += chunkSize) {
          const chunk = dbRows.slice(i, i + chunkSize);
          const { error } = await supabase.from("tasks").upsert(chunk, { onConflict: "id" });
          if (error) {
            console.error("Vehicle task upsert chunk error:", error);
            throw error;
          }
        }
      }
    } catch (e) {
      console.error("Failed to save vehicle tasks to Supabase", e);
    }
  }

  async function deleteVehicleTask(id) {
    if (!window.confirm("Are you sure you want to delete this vehicle maintenance task?")) return;
    setShowForm(false);
    setEditTask(null);
    const nextList = vehicleTasks.filter((t) => t.id !== id);
    setVehicleTasks(nextList);
    await saveVehicleTasks(nextList);
    try {
      await supabase.from("tasks").delete().eq("id", id);
    } catch (e) {
      console.error(e);
    }
  }

  function handleExportVehicleTasks() {
    const data = filteredVehicleTasks.map((t) => ({
      "Vehicle Number": t.project || "—",
      "Invoice Number": t.invoiceNo || "—",
      "Date": t.startDate || "—",
      "Type": t.serviceType || "Service",
      "Maintenance Service Task": t.task || "—",
      "Meter Reading": t.meterReading || "—",
      "Service Provider": t.serviceProvider || "—",
      "Total Cost": t.totalCost ? Number(t.totalCost) : 0,
      "Description / Notes": t.description || "—"
    }));
    exportToExcel(data, "Vehicle_Maintenance_Logs", "Vehicle Logs");
  }
  const [users, setUsers] = useState(() => {
    try {
      const cached = localStorage.getItem("cached-users");
      const parsed = cached ? JSON.parse(cached) : [];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) { }
    return [
      { username: "Lakshan", role: "management", password: "RPM1234" },
      { username: "Vishwa", role: "management", password: "RPM1234" },
      { username: "Normal", role: "normal", password: "RPM5678" }
    ];
  });

  const DEFAULT_SERVICE_PROVIDERS = [
    "Bobby Lanka",
    "LAUGFS LUBRICANTS",
    "Ugith Motors",
    "Pradeep Motors",
    "Creative Auto Shine",
    "Dilahara Motors",
    "Suji Tractor Repairs",
    "Dhananjaya Electrical",
    "Rukmal Electrical",
    "Nandasena Electrical"
  ];

  const [serviceProviders, setServiceProviders] = useState(() => {
    try {
      const cached = localStorage.getItem("cached-service-providers");
      const parsed = cached ? JSON.parse(cached) : null;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) { }
    return DEFAULT_SERVICE_PROVIDERS;
  });

  function handleAddServiceProvider(newProvider) {
    if (!newProvider || !newProvider.trim()) return;
    const trimmed = newProvider.trim();
    if (!serviceProviders.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
      const nextList = [...serviceProviders, trimmed];
      setServiceProviders(nextList);
      try {
        localStorage.setItem("cached-service-providers", JSON.stringify(nextList));
      } catch (e) { }
    }
  }

  function handleDeleteServiceProvider(providerToDelete) {
    if (!providerToDelete) return;
    const nextList = serviceProviders.filter(p => p !== providerToDelete);
    setServiceProviders(nextList);
    try {
      localStorage.setItem("cached-service-providers", JSON.stringify(nextList));
    } catch (e) { }
  }

  const DEFAULT_VEHICLE_NUMBERS = [
    "227-7535",
    "227-2827",
    "work shop lorry",
    "KI-7878",
    "LF-0469",
    "227-3245",
    "LI-5245",
    "LN-9636",
    "ZB-2499",
    "PB-5011",
    "52-4194",
    "NE-4738",
    "LP-7426",
    "LP-7621",
    "26-8115",
    "GF-2939",
    "RG-5755",
    "RH-1415",
    "RH-4480",
    "KI-4665",
    "64-6306"
  ];

  const [vehicleNumbers, setVehicleNumbers] = useState(() => {
    try {
      const cached = localStorage.getItem("cached-vehicle-numbers");
      const parsed = cached ? JSON.parse(cached) : null;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) { }
    return DEFAULT_VEHICLE_NUMBERS;
  });

  function handleAddVehicleNumber(newVehicle) {
    if (!newVehicle || !newVehicle.trim()) return;
    const trimmed = newVehicle.trim();
    if (!vehicleNumbers.some(v => v.toLowerCase() === trimmed.toLowerCase())) {
      const nextList = [...vehicleNumbers, trimmed];
      setVehicleNumbers(nextList);
      try {
        localStorage.setItem("cached-vehicle-numbers", JSON.stringify(nextList));
      } catch (e) { }
    }
  }

  function handleDeleteVehicleNumber(vehicleToDelete) {
    if (!vehicleToDelete) return;
    const nextList = vehicleNumbers.filter(v => v !== vehicleToDelete);
    setVehicleNumbers(nextList);
    try {
      localStorage.setItem("cached-vehicle-numbers", JSON.stringify(nextList));
    } catch (e) { }
  }

  const [view, setView] = useState("m-dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pChartStatusFilter, setPChartStatusFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedInventorySection, setSelectedInventorySection] = useState("");
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("app-theme") || "dark";
  });

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("app-theme", nextTheme);
  };

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.add("light-mode");
    } else {
      document.documentElement.classList.remove("light-mode");
    }
  }, [theme]);

  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showInvForm, setShowInvForm] = useState(false);
  const [editingInvItem, setEditingInvItem] = useState(null);
  const [formType, setFormType] = useState("maintenance");
  const [mSearch, setMSearch] = useState("");
  const [pSearch, setPSearch] = useState("");
  const [tSearch, setTSearch] = useState("");
  const [mStatusFilter, setMStatusFilter] = useState("All");
  const [pStatusFilter, setPStatusFilter] = useState("All");
  const [tStatusFilter, setTStatusFilter] = useState("All");
  const [mAssigneeFilter, setMAssigneeFilter] = useState("All");
  const [pAssigneeFilter, setPAssigneeFilter] = useState("All");
  const [tAssigneeFilter, setTAssigneeFilter] = useState("All");
  const [mFromDate, setMFromDate] = useState("");
  const [mToDate, setMToDate] = useState("");
  const [pFromDate, setPFromDate] = useState("");
  const [pToDate, setPToDate] = useState("");
  const [tFromDate, setTFromDate] = useState("");
  const [tToDate, setTToDate] = useState("");
  const [invSearch, setInvSearch] = useState("");
  const [invStatusFilter, setInvStatusFilter] = useState("All");
  const [invChartStatusFilter, setInvChartStatusFilter] = useState("All");
  const [invAssigneeFilter, setInvAssigneeFilter] = useState("All");
  const [invFromDate, setInvFromDate] = useState("");
  const [invToDate, setInvToDate] = useState("");
  const [vSearch, setVSearch] = useState("");
  const [vStatusFilter, setVStatusFilter] = useState("All");
  const [vAssigneeFilter, setVAssigneeFilter] = useState("All");
  const [vFromDate, setVFromDate] = useState("");
  const [vToDate, setVToDate] = useState("");
  const [vViewMode, setVViewMode] = useState("logs");
  const [err, setErr] = useState("");
  const [viewingPhotos, setViewingPhotos] = useState(null);

  // Universal Back Navigation Action (modal closing -> section/project unselecting -> view back)
  function handleGoBack() {
    if (menuOpen) {
      setMenuOpen(false);
      return true;
    }
    if (showForm || editTask) {
      setShowForm(false);
      setEditTask(null);
      return true;
    }
    if (showProjectForm) {
      setShowProjectForm(false);
      return true;
    }
    if (showInvForm || editingInvItem) {
      setShowInvForm(false);
      setEditingInvItem(null);
      return true;
    }
    if (viewingPhotos) {
      setViewingPhotos(null);
      return true;
    }
    if (selectedInventorySection) {
      setSelectedInventorySection("");
      return true;
    }
    if (selectedProject) {
      setSelectedProject("");
      return true;
    }
    if (view !== "m-dashboard") {
      setView("m-dashboard");
      return true;
    }
    if (window.history.length > 1) {
      window.history.back();
      return true;
    }
    return false;
  }

  // Touch Edge Swipe Gesture Engine
  const [gestureProgress, setGestureProgress] = useState(0);
  const [gestureActive, setGestureActive] = useState(false);
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });

  useEffect(() => {
    let active = false;

    const handleTouchStart = (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      const touch = e.touches[0];
      // Capture swipe starting near left screen edge (< 50px)
      if (touch.clientX < 50) {
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now()
        };
        active = true;
        setGestureActive(true);
      }
    };

    const handleTouchMove = (e) => {
      if (!active || !e.touches || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;

      // Cancel gesture if vertical scrolling dominates
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 20) {
        active = false;
        setGestureActive(false);
        setGestureProgress(0);
        return;
      }

      if (deltaX > 0) {
        const progress = Math.min(1, deltaX / 110);
        setGestureProgress(progress);
      }
    };

    const handleTouchEnd = (e) => {
      if (!active) return;
      const touch = e.changedTouches ? e.changedTouches[0] : null;
      if (touch) {
        const deltaX = touch.clientX - touchStartRef.current.x;
        const deltaY = touch.clientY - touchStartRef.current.y;
        const duration = Date.now() - touchStartRef.current.time;

        if (deltaX > 65 && Math.abs(deltaY) < 65 && duration < 650) {
          if (navigator.vibrate) {
            try { navigator.vibrate(15); } catch (err) { }
          }
          handleGoBack();
        }
      }
      active = false;
      setGestureActive(false);
      setGestureProgress(0);
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [menuOpen, showForm, editTask, showProjectForm, showInvForm, editingInvItem, viewingPhotos, selectedInventorySection, selectedProject, view]);

  // Sync state from hash routing helper (handles popstate / hashchange)
  function syncStateFromHash() {
    const hash = window.location.hash || "";
    if (hash.startsWith("#/view/")) {
      const rawPath = hash.substring(7);
      const modalIndex = rawPath.indexOf("/modal/");
      let mainPath = rawPath;
      let modalType = "";
      if (modalIndex !== -1) {
        mainPath = rawPath.substring(0, modalIndex);
        modalType = rawPath.substring(modalIndex + 7);
      }

      if (mainPath.includes("/project/")) {
        const parts = mainPath.split("/project/");
        const viewName = parts[0];
        const rawName = parts[1];
        const decodedName = decodeURIComponent(rawName || "");
        setView(viewName);
        if (viewName === "inventory" || viewName === "inv-dashboard") {
          setSelectedInventorySection(decodedName);
          setSelectedProject("");
        } else {
          setSelectedProject(decodedName);
          setSelectedInventorySection("");
        }
      } else {
        setView(mainPath || "m-dashboard");
        setSelectedProject("");
        setSelectedInventorySection("");
      }

      // Sync Modals
      if (modalType === "task-form") {
        setShowForm(true);
        setShowProjectForm(false);
        setShowInvForm(false);
        setMenuOpen(false);
      } else if (modalType === "project-form") {
        setShowProjectForm(true);
        setShowForm(false);
        setShowInvForm(false);
        setMenuOpen(false);
      } else if (modalType === "inv-form") {
        setShowInvForm(true);
        setShowForm(false);
        setShowProjectForm(false);
        setMenuOpen(false);
      } else if (modalType === "menu") {
        setMenuOpen(true);
      } else if (modalType === "photos") {
        // Keep viewingPhotos active
      } else {
        setShowForm(false);
        setEditTask(null);
        setShowProjectForm(false);
        setShowInvForm(false);
        setEditingInvItem(null);
        setMenuOpen(false);
        setViewingPhotos(null);
      }
    } else {
      setView("m-dashboard");
      setSelectedProject("");
      setSelectedInventorySection("");
      setShowForm(false);
      setShowProjectForm(false);
      setShowInvForm(false);
      setMenuOpen(false);
      setViewingPhotos(null);
    }
  }

  // Effect to listen for browser back/forward buttons (hashchange event)
  useEffect(() => {
    syncStateFromHash();

    const handleHashChange = () => {
      syncStateFromHash();
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  // Effect to update browser hash when React state changes (creating history entries)
  useEffect(() => {
    let expectedHash = "";
    const baseView = view || "m-dashboard";
    if (baseView === "inventory" || baseView === "inv-dashboard") {
      expectedHash = selectedInventorySection
        ? `#/view/${baseView}/project/${encodeURIComponent(selectedInventorySection)}`
        : `#/view/${baseView}`;
    } else if (selectedProject) {
      expectedHash = `#/view/${baseView}/project/${encodeURIComponent(selectedProject)}`;
    } else {
      expectedHash = `#/view/${baseView}`;
    }

    if (viewingPhotos) expectedHash += "/modal/photos";
    else if (showForm) expectedHash += "/modal/task-form";
    else if (showProjectForm) expectedHash += "/modal/project-form";
    else if (showInvForm) expectedHash += "/modal/inv-form";
    else if (menuOpen) expectedHash += "/modal/menu";

    if (window.location.hash !== expectedHash) {
      window.location.hash = expectedHash;
    }
  }, [view, selectedProject, selectedInventorySection, showForm, showProjectForm, showInvForm, menuOpen, viewingPhotos]);

  // Fetch tasks from Supabase with unlimited bulk pagination
  async function fetchTasks() {
    try {
      let data = [];
      let pageFrom = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: pageData, error } = await supabase
          .from("tasks")
          .select("*")
          .order("createdAt", { ascending: true })
          .range(pageFrom, pageFrom + pageSize - 1);

        if (error) throw error;
        if (!pageData || pageData.length === 0) {
          hasMore = false;
          break;
        }
        data.push(...pageData);
        if (pageData.length < pageSize) {
          hasMore = false;
        } else {
          pageFrom += pageSize;
        }
      }

      let parsed = (data || []).map(parseTaskRow);

      const mainTasks = parsed.filter(t => !isVehicleTaskRow(t));
      const vTasks = parsed.filter(isVehicleTaskRow);

      try {
        localStorage.setItem("cached-job-tasks", JSON.stringify(mainTasks));
      } catch (e) { }
      setTasks(mainTasks);

      try {
        localStorage.setItem("cached-vehicle-maintenance-tasks", JSON.stringify(vTasks));
      } catch (e) { }
      setVehicleTasks(vTasks);
    } catch (e) {
      console.error("Failed to fetch tasks", e);
    }
  }

  // Fetch users from Supabase (seeds defaults on first run if table is empty)
  async function fetchUsers() {
    try {
      const { data, error } = await supabase.from("users").select("*").order("username");
      if (error) throw error;
      if (data && data.length > 0) {
        setUsers(data);
        try {
          localStorage.setItem("cached-users", JSON.stringify(data));
        } catch (e) { }
      } else {
        const defaults = [
          { username: "Lakshan", role: "management", password: "RPM1234" },
          { username: "Vishwa", role: "management", password: "RPM1234" },
          { username: "Normal", role: "normal", password: "RPM5678" },
        ];
        setUsers(defaults);
        await supabase.from("users").upsert(defaults, { onConflict: "username" });
      }
    } catch (e) {
      console.error("Failed to fetch users", e);
    }
  }

  // Initial load: session from sessionStorage (per-device, not shared), users & tasks from Supabase
  useEffect(() => {
    let mounted = true;
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoadingSession(false);
    }, 2500);

    (async () => {
      try {
        const s = sessionStorage.getItem("session");
        if (s && mounted) setSession(JSON.parse(s));
      } catch (e) { }

      try {
        await Promise.all([fetchUsers(), fetchTasks()]);
      } catch (e) {
        console.error("Initial fetch error:", e);
      } finally {
        clearTimeout(safetyTimer);
        if (mounted) setLoadingSession(false);
      }
    })();

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
    };
  }, []);

  useEffect(() => {
    if (session?.role === "maintenance" && view !== "maintenance") {
      setView("maintenance");
    }
  }, [session, view]);

  // Realtime subscriptions: any insert/update/delete on tasks or users
  // is pushed instantly by Supabase across all devices (PC & Mobile).
  //
  // IMPORTANT: these handlers patch ONLY the single row that changed into
  // local state, using the payload Supabase already sent over the realtime
  // websocket. They deliberately do NOT call fetchTasks()/fetchUsers(),
  // because that would re-download the entire table (including embedded
  // base64 photos) to every connected device on every single change -
  // that full-table-refetch-on-every-event pattern was the main cause of
  // high Supabase egress.
  useEffect(() => {
    const usersChannel = supabase
      .channel("users-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const removedUsername = payload.old?.username;
            setUsers((prev) => {
              const next = prev.filter((u) => u.username !== removedUsername);
              try { localStorage.setItem("cached-users", JSON.stringify(next)); } catch (e) { }
              return next;
            });
            return;
          }
          const row = payload.new;
          if (!row) return;
          setUsers((prev) => {
            const idx = prev.findIndex((u) => u.username === row.username);
            const next = idx === -1 ? [...prev, row] : prev.map((u, i) => (i === idx ? row : u));
            try { localStorage.setItem("cached-users", JSON.stringify(next)); } catch (e) { }
            return next;
          });
        }
      )
      .subscribe((status) => {
        console.log("[realtime] users channel status:", status);
      });

    const tasksChannel = supabase
      .channel("tasks-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const removedId = payload.old?.id;
            setTasks((prev) => {
              const next = prev.filter((t) => t.id !== removedId);
              try { localStorage.setItem("cached-job-tasks", JSON.stringify(next)); } catch (e) { }
              return next;
            });
            setVehicleTasks((prev) => {
              const next = prev.filter((t) => t.id !== removedId);
              try { localStorage.setItem("cached-vehicle-maintenance-tasks", JSON.stringify(next)); } catch (e) { }
              return next;
            });
            return;
          }

          const raw = payload.new;
          if (!raw) return;
          const parsed = parseTaskRow(raw);
          const vehicle = isVehicleTaskRow(parsed);

          const applyPatch = (prev) => {
            const idx = prev.findIndex((t) => t.id === parsed.id);
            return idx === -1 ? [...prev, parsed] : prev.map((t, i) => (i === idx ? parsed : t));
          };

          if (vehicle) {
            setVehicleTasks((prev) => {
              const next = applyPatch(prev);
              try { localStorage.setItem("cached-vehicle-maintenance-tasks", JSON.stringify(next)); } catch (e) { }
              return next;
            });
          } else {
            setTasks((prev) => {
              const next = applyPatch(prev);
              try { localStorage.setItem("cached-job-tasks", JSON.stringify(next)); } catch (e) { }
              return next;
            });
          }
        }
      )
      .subscribe((status) => {
        console.log("[realtime] tasks channel status:", status);
      });

    return () => {
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(tasksChannel);
    };
  }, []);

  async function saveTasks(next) {
    const prev = tasks; // pre-update snapshot, for diffing
    setTasks(next);
    try {
      localStorage.setItem("cached-job-tasks", JSON.stringify(next));
    } catch (e) { }
    try {
      // Only rows that are new or whose object reference changed get written
      // back to Supabase - unmodified rows keep the same reference (see call
      // sites), so this avoids rewriting the entire table on every save,
      // which was the main driver of Supabase egress/writes.
      const prevById = new Map(prev.map((t) => [t.id, t]));
      const changedNext = next.filter((t) => prevById.get(t.id) !== t);

      const nextIds = new Set(next.map((t) => t.id));
      const removedIds = prev.filter((t) => !nextIds.has(t.id)).map((t) => t.id);
      if (removedIds.length > 0) {
        await supabase.from("tasks").delete().in("id", removedIds);
      }

      // Combine all client-only breakdown/extended fields into assignee column and strictly output only valid SQL table columns in dbRows
      const dbRows = changedNext.map((t) => {
        const photoPayload = t.photos && t.photos.length ? JSON.stringify(t.photos) : "";
        const descPayload = t.description ? t.description.trim() : "";
        const subTasksPayload = t.subTasks && t.subTasks.length ? JSON.stringify(t.subTasks) : "";
        const timesPayload = (t.breakdownTime || t.breakdownEndTime) ? JSON.stringify({ bTime: t.breakdownTime || "", eTime: t.breakdownEndTime || "" }) : "";
        const downHoursVal = t.daysRequired !== undefined && t.daysRequired !== null && !isNaN(Number(t.daysRequired))
          ? Number(t.daysRequired)
          : 0;
        const breakdownExtraPayload = JSON.stringify({
          machineryPart: t.machineryPart || "",
          faultType: t.faultType || "",
          electricalFault: !!t.electricalFault,
          mechanicalFault: !!t.mechanicalFault,
          downHours: downHoursVal
        });

        const assigneeString = `${t.location || ""} ||| ${t.assigneeName || ""} ||| ${photoPayload} ||| ${descPayload} ||| ${subTasksPayload} ||| ${timesPayload} ||| ${breakdownExtraPayload}`;

        const row = {
          id: t.id,
          project: t.project || "",
          projectToken: t.projectToken || "maintenance",
          task: t.task || "",
          assignee: assigneeString,
          startDate: t.startDate ? String(t.startDate).slice(0, 10) : null,
          endDate: t.endDate ? String(t.endDate).slice(0, 10) : null,
          daysRequired: Math.round(Number(t.daysRequired) || 0),
          progress: Math.round(Number(t.progress) || 0),
        };

        if (t.createdBy) row.createdBy = t.createdBy;
        if (t.createdAt) row.createdAt = t.createdAt;

        return row;
      });

      if (dbRows.length) {
        const chunkSize = 25;
        for (let i = 0; i < dbRows.length; i += chunkSize) {
          const chunk = dbRows.slice(i, i + chunkSize);
          const { error } = await supabase.from("tasks").upsert(chunk, { onConflict: "id" });
          if (error) throw error;
        }
      }
      setErr("");
    } catch (e) {
      setErr("Couldn't save: " + (e.message || JSON.stringify(e)));
    }
  }

  async function saveUsers(next) {
    const prev = users; // pre-update snapshot, for diffing
    setUsers(next);
    try {
      localStorage.setItem("cached-users", JSON.stringify(next));
    } catch (e) { }
    try {
      const nextUsernames = new Set(next.map((u) => u.username));
      const toDelete = prev.filter((u) => !nextUsernames.has(u.username));

      if (toDelete.length) {
        const { error } = await supabase
          .from("users")
          .delete()
          .in("username", toDelete.map((u) => u.username));
        if (error) throw error;
      }

      const prevByName = new Map(prev.map((u) => [u.username, u]));
      const changed = next.filter((u) => prevByName.get(u.username) !== u);
      if (changed.length) {
        const { error } = await supabase
          .from("users")
          .upsert(changed, { onConflict: "username" });
        if (error) throw error;
      }
      setErr("");
    } catch (e) {
      console.error(e);
      setErr("Couldn't save users: " + (e.message || JSON.stringify(e)));
    }
  }

  async function handleLogin(name, role) {
    const s = { name: name.trim(), role };
    setSession(s);
    if (role === "maintenance") {
      setView("maintenance");
    } else {
      setView("m-dashboard");
    }
    try {
      sessionStorage.setItem("session", JSON.stringify(s));
    } catch (e) { }
  }
  async function handleLogout() {
    setSession(null);
    setView("m-dashboard");
    try {
      sessionStorage.removeItem("session");
    } catch (e) { }
  }

  function nextId() {
    const nums = tasks.map((t) => parseInt(String(t.id).replace("T-", ""), 10)).filter((n) => !isNaN(n));
    const max = nums.length ? Math.max(...nums) : 1000;
    return `T-${max + 1}`;
  }

  async function upsertVehicleTask(data, id) {
    setShowForm(false);
    setEditTask(null);
    try {
      const now = new Date().toISOString();
      const calculatedEnd = data.startDate ? addDays(data.startDate, data.daysRequired) : null;
      const endDate = data.endDateOverride || data.endDate || calculatedEnd || data.startDate || null;
      let nextList = [...vehicleTasks];
      if (id) {
        nextList = nextList.map((t) => (t.id === id ? { ...t, ...data, endDate, updatedAt: now } : t));
      } else {
        const vNums = vehicleTasks.map((t) => parseInt(String(t.id).replace("V-", ""), 10)).filter((n) => !isNaN(n));
        const maxV = vNums.length ? Math.max(...vNums) : 1000;
        const newVId = `V-${maxV + 1}`;
        nextList = [
          ...vehicleTasks,
          {
            id: newVId,
            ...data,
            projectToken: "vehicle",
            endDate,
            createdBy: session.name,
            createdAt: now,
            updatedAt: now,
          },
        ];
      }
      setVehicleTasks(nextList);
      await saveVehicleTasks(nextList);
    } catch (e) {
      console.error("upsertVehicleTask error:", e);
    }
  }

  async function upsertTask(data, id) {
    if (data.projectToken === "vehicle" || data.projectToken === "vehicle-maintenance") {
      return upsertVehicleTask(data, id);
    }
    setShowForm(false);
    setEditTask(null);
    try {
      const now = new Date().toISOString();
      const calculatedEnd = data.startDate ? addDays(data.startDate, data.daysRequired) : null;
      const endDate = data.endDateOverride || data.endDate || calculatedEnd || data.startDate || null;
      const nextList = id
        ? tasks.map((t) => (t.id === id ? { ...t, ...data, endDate, updatedAt: now } : t))
        : [
          ...tasks,
          {
            id: nextId(),
            ...data,
            endDate,
            createdBy: session.name,
            createdAt: now,
            updatedAt: now,
          },
        ];

      setTasks(nextList);
      await saveTasks(nextList);
    } catch (e) {
      console.error("upsertTask error:", e);
    }
  }

  async function handleCreateProject(name) {
    if (!name || !name.trim()) return;
    const trimmedName = name.trim();

    const exists = tasks.some(
      (t) => t.projectToken !== "maintenance" && t.project && t.project.toLowerCase() === trimmedName.toLowerCase()
    );
    if (exists) {
      alert("Project already exists!");
      return;
    }

    const placeholder = {
      id: "P-" + Date.now(),
      project: trimmedName,
      projectToken: "project",
      task: "__init__",
      assignee: "",
      progress: 0,
      startDate: todayStr(),
      daysRequired: 0,
      endDate: todayStr(),
      createdBy: session.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await saveTasks([...tasks, placeholder]);
    setSelectedProject(trimmedName);
  }

  async function handleCreateInventoryItem(name) {
    if (!name || !name.trim()) return;
    const trimmedName = name.trim();

    const exists = tasks.some(
      (t) => t.projectToken === "inventory" && t.project && t.project.toLowerCase() === trimmedName.toLowerCase()
    );
    if (exists) {
      alert("Machinery Section already exists!");
      return;
    }

    const placeholder = {
      id: "P-INV-" + Date.now(),
      project: trimmedName,
      projectToken: "inventory",
      task: "__init__",
      assignee: "C: Little to No Financial Impact ||| ||| [] ||| ||| []",
      progress: 0,
      startDate: todayStr(),
      daysRequired: 0,
      endDate: todayStr(),
      createdBy: session.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await saveTasks([...tasks, placeholder]);
    setSelectedProject(trimmedName);
  }

  async function handleDeleteInventoryItem(assetName) {
    const tasksToDelete = tasks.filter(
      (t) => t.projectToken === "inventory" && t.project && t.project.toLowerCase() === assetName.toLowerCase()
    );
    if (!window.confirm(`Delete all ${tasksToDelete.filter(t => t.task !== "__init__").length} breakdown task(s) for "${assetName}"? This cannot be undone.`)) return;
    const nextList = tasks.filter(
      (t) => !(t.projectToken === "inventory" && t.project && t.project.toLowerCase() === assetName.toLowerCase())
    );
    await saveTasks(nextList);
  }

  async function handleRenameInventoryItem(oldName, newName) {
    if (!newName || !newName.trim()) return;
    const trimmedNew = newName.trim();
    if (trimmedNew.toLowerCase() === oldName.toLowerCase()) return;

    const exists = tasks.some(
      (t) => t.projectToken === "inventory" && t.project && t.project.toLowerCase() === trimmedNew.toLowerCase()
    );
    if (exists) {
      alert("A Machinery Section with this name already exists!");
      return;
    }

    const nextList = tasks.map((t) => {
      if (t.projectToken === "inventory" && t.project && t.project.toLowerCase() === oldName.toLowerCase()) {
        return { ...t, project: trimmedNew, updatedAt: new Date().toISOString() };
      }
      return t;
    });

    await saveTasks(nextList);
    if (selectedInventorySection && selectedInventorySection.toLowerCase() === oldName.toLowerCase()) {
      setSelectedInventorySection(trimmedNew);
    }
  }

  function handleEditTaskSelect(t) {
    setFormType(t.projectToken);
    setEditTask(t);
  }

  async function deleteTask(id) {
    setShowForm(false);
    setEditTask(null);
    const taskToDelete = tasks.find((t) => t.id === id);
    let nextList = tasks.filter((t) => t.id !== id);
    if (taskToDelete && taskToDelete.projectToken !== "maintenance" && taskToDelete.project) {
      const remainingTasksInProj = nextList.filter(
        (t) => t.projectToken === taskToDelete.projectToken && t.project && t.project.toLowerCase() === taskToDelete.project.toLowerCase()
      );
      if (remainingTasksInProj.length === 0) {
        const placeholder = {
          id: "P-" + Date.now(),
          project: taskToDelete.project,
          projectToken: taskToDelete.projectToken,
          task: "__init__",
          assignee: "",
          progress: 0,
          startDate: todayStr(),
          daysRequired: 0,
          endDate: todayStr(),
          createdBy: session.name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        nextList = [...nextList, placeholder];
      }
    }
    setTasks(nextList);
    try {
      await supabase.from("tasks").delete().eq("id", id);
    } catch (e) {
      console.error("deleteTask error:", e);
    }
    await saveTasks(nextList);
  }

  async function quickProgress(id, progress) {
    const now = new Date().toISOString();
    const next = tasks.map((t) => (t.id === id ? { ...t, progress, updatedAt: now } : t));
    await saveTasks(next);
  }

  const maintenanceTasks = useMemo(() => tasks.filter(t => t.projectToken === "maintenance" && t.task !== "__init__"), [tasks]);
  const inventoryTasks = useMemo(() => tasks.filter(t => t.projectToken === "inventory" && t.task !== "__init__"), [tasks]);

  const projectTasks = useMemo(() => tasks.filter(t =>
    t.projectToken !== "maintenance" &&
    t.projectToken !== "inventory" &&
    t.projectToken !== "vehicle" &&
    t.projectToken !== "vehicle-maintenance" &&
    t.task !== "__init__" &&
    t.task.toLowerCase() !== "main project" &&
    t.task.toLowerCase() !== "main" &&
    t.task.toLowerCase() !== (t.project || "").toLowerCase()
  ), [tasks]);

  const filteredVehicleTasks = useMemo(() => {
    let list = vehicleTasks;
    if (vStatusFilter !== "All") {
      list = list.filter(t => (t.serviceType || "Service") === vStatusFilter);
    }
    if (vFromDate) {
      list = list.filter(t => t.startDate >= vFromDate);
    }
    if (vToDate) {
      list = list.filter(t => t.startDate <= vToDate);
    }
    if (vSearch.trim()) {
      const q = vSearch.toLowerCase().trim();
      list = list.filter(t =>
        (t.project && t.project.toLowerCase().includes(q)) ||
        (t.invoiceNo && t.invoiceNo.toLowerCase().includes(q)) ||
        (t.task && t.task.toLowerCase().includes(q)) ||
        (t.serviceType && t.serviceType.toLowerCase().includes(q)) ||
        (t.serviceProvider && t.serviceProvider.toLowerCase().includes(q)) ||
        (t.meterReading && t.meterReading.toLowerCase().includes(q))
      );
    }
    return list;
  }, [vehicleTasks, vSearch, vStatusFilter, vFromDate, vToDate]);

  const vByTypeData = useMemo(() => {
    const map = {};
    vehicleTasks.forEach((t) => {
      const typeName = t.serviceType ? t.serviceType.trim() : "Service";
      const key = typeName.toLowerCase();
      if (!map[key]) {
        map[key] = { name: typeName, value: 0 };
      }
      map[key].value += 1;
    });
    return Object.values(map);
  }, [vehicleTasks]);

  const vCostByVehicleData = useMemo(() => {
    const map = {};
    let grandTotal = 0;
    vehicleTasks.forEach((t) => {
      const vehicle = t.project ? t.project.trim() : "Unassigned";
      const key = vehicle.toLowerCase();
      if (!map[key]) {
        map[key] = { vehicle, totalCost: 0 };
      }
      const cost = Number(t.totalCost);
      const validCost = isNaN(cost) ? 0 : cost;
      map[key].totalCost += validCost;
      grandTotal += validCost;
    });
    return Object.values(map).map(item => ({ ...item, totalSum: grandTotal }));
  }, [vehicleTasks]);
  const projectsList = useMemo(() => {
    const seen = new Set();
    const list = [];
    tasks.forEach((t) => {
      if (t.projectToken !== "maintenance" && t.projectToken !== "inventory" && t.project) {
        const val = t.project.trim();
        const lower = val.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          list.push(val);
        }
      }
    });
    return list;
  }, [tasks]);

  const inventoryItemsList = useMemo(() => {
    const seen = new Set();
    const list = [];
    tasks.forEach((t) => {
      if (t.projectToken === "inventory" && t.project) {
        const val = t.project.trim();
        const lower = val.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          list.push(val);
        }
      }
    });
    return list;
  }, [tasks]);

  const filteredInventoryItemsList = useMemo(() => {
    const list = inventoryItemsList;
    const query = invSearch.trim().toLowerCase();
    if (!query) return list;
    return list.filter(item => item.toLowerCase().includes(query));
  }, [inventoryItemsList, invSearch]);

  const assigneeNames = useMemo(() => {
    const seen = new Set();
    const list = [];
    tasks.forEach((t) => {
      if (t.location) {
        const val = t.location.trim();
        const lower = val.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          list.push(val);
        }
      }
    });
    return list;
  }, [tasks]);

  const creatorNames = useMemo(() => {
    const seen = new Set();
    const list = [];
    tasks.forEach((t) => {
      if (t.createdBy) {
        const val = t.createdBy.trim();
        const lower = val.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          list.push(val);
        }
      }
    });
    return list;
  }, [tasks]);

  const allAssigneeNames = useMemo(() => {
    const excludedUsernames = new Set(["vishwa", "udara", "user", "lakshan"]);
    const seen = new Set();
    const list = [];
    tasks.forEach((t) => {
      if (t.assigneeName) {
        const parts = t.assigneeName.split(",").map((s) => s.trim()).filter(Boolean);
        parts.forEach((val) => {
          const lower = val.toLowerCase();
          if (!excludedUsernames.has(lower) && !seen.has(lower)) {
            seen.add(lower);
            list.push(val);
          }
        });
      }
    });
    [...DEFAULT_ASSIGNEES, ...DEFAULT_PROJECT_ASSIGNEES].forEach((val) => {
      const lower = val.toLowerCase().trim();
      if (!excludedUsernames.has(lower) && !seen.has(lower)) {
        seen.add(lower);
        list.push(val);
      }
    });
    return list.sort();
  }, [tasks]);

  const mTotals = useMemo(() => {
    const c = { "Not Started": 0, "In Progress": 0, Completed: 0 };
    let daysScope = 0;
    let count = 0;
    maintenanceTasks.forEach((t) => {
      count++;
      const progressVal = Number(t.progress) || 0;
      c[statusOf(progressVal)]++;
      const daysVal = Number(t.daysRequired);
      daysScope += isNaN(daysVal) ? 0 : daysVal;
    });
    return {
      totalTasks: count,
      daysScope,
      statusCounts: c,
    };
  }, [maintenanceTasks]);

  const mOverdue = useMemo(() => {
    const today = todayStr();
    return maintenanceTasks.filter((t) => t.endDate && t.endDate < today && Number(t.progress) < 100);
  }, [maintenanceTasks]);

  const mByAssignee = useMemo(() => {
    const today = todayStr();
    const map = {};
    maintenanceTasks.forEach((t) => {
      const assignees = t.assigneeName
        ? t.assigneeName.split(",").map((s) => s.trim()).filter(Boolean)
        : ["Unassigned"];

      assignees.forEach((assignee) => {
        const origKey = assignee;
        const lowerKey = origKey.toLowerCase();
        if (!map[lowerKey]) {
          map[lowerKey] = {
            assignee: origKey,
            tasks: 0,
            completed: 0,
            inProgress: 0,
            notStarted: 0,
            overdue: 0,
            days: 0,
            progressSum: 0
          };
        }

        const daysVal = Number(t.daysRequired);
        const progVal = Number(t.progress) || 0;

        map[lowerKey].tasks++;
        map[lowerKey].days += isNaN(daysVal) ? 0 : daysVal;
        map[lowerKey].progressSum += isNaN(progVal) ? 0 : progVal;

        if (progVal === 100) {
          map[lowerKey].completed++;
        } else if (progVal > 0) {
          map[lowerKey].inProgress++;
        } else {
          map[lowerKey].notStarted++;
        }

        if (t.endDate && t.endDate < today && progVal < 100) {
          map[lowerKey].overdue++;
        }
      });
    });
    return Object.values(map).map((p) => {
      const avg = p.tasks ? Math.round(p.progressSum / p.tasks) : 0;
      return {
        ...p,
        avgProgress: isNaN(avg) ? 0 : avg
      };
    });
  }, [maintenanceTasks]);

  const mByTaskName = useMemo(() => {
    const map = {};
    maintenanceTasks.forEach((t) => {
      if (!t.project) return;
      const origKey = t.project.trim();
      const lowerKey = origKey.toLowerCase();
      if (!map[lowerKey]) {
        map[lowerKey] = {
          displayName: origKey,
          tasks: 0,
          days: 0,
          progressSum: 0
        };
      }

      const daysVal = Number(t.daysRequired);
      const progVal = Number(t.progress);

      map[lowerKey].tasks++;
      map[lowerKey].days += isNaN(daysVal) ? 0 : daysVal;
      map[lowerKey].progressSum += isNaN(progVal) ? 0 : progVal;
    });
    return Object.values(map).map((p) => {
      const avg = p.tasks ? Math.round(p.progressSum / p.tasks) : 0;
      return {
        ...p,
        avgProgress: isNaN(avg) ? 0 : avg
      };
    });
  }, [maintenanceTasks]);

  const mByCreator = useMemo(() => {
    const map = {};
    maintenanceTasks.forEach((t) => {
      if (!t.createdBy) return;
      const origKey = t.createdBy.trim();
      const lowerKey = origKey.toLowerCase();
      if (!map[lowerKey]) map[lowerKey] = { creator: origKey, tasks: 0, days: 0, progressSum: 0 };

      const daysVal = Number(t.daysRequired);
      const progVal = Number(t.progress);

      map[lowerKey].tasks++;
      map[lowerKey].days += isNaN(daysVal) ? 0 : daysVal;
      map[lowerKey].progressSum += isNaN(progVal) ? 0 : progVal;
    });
    return Object.values(map).map((p) => {
      const avg = p.tasks ? Math.round(p.progressSum / p.tasks) : 0;
      return {
        ...p,
        avgProgress: isNaN(avg) ? 0 : avg
      };
    });
  }, [maintenanceTasks]);

  const pTotals = useMemo(() => {
    const c = { "Not Started": 0, "In Progress": 0, Completed: 0 };
    let daysScope = 0;
    let count = 0;
    projectTasks.forEach((t) => {
      count++;
      const progressVal = Number(t.progress) || 0;
      c[statusOf(progressVal)]++;
      const daysVal = Number(t.daysRequired);
      daysScope += isNaN(daysVal) ? 0 : daysVal;
    });
    return {
      totalProjects: projectsList.length,
      totalTasks: count,
      daysScope,
      statusCounts: c,
    };
  }, [projectTasks, projectsList]);

  const pOverdue = useMemo(() => {
    const today = todayStr();
    return projectTasks.filter((t) => t.endDate && t.endDate < today && Number(t.progress) < 100);
  }, [projectTasks]);

  const pByAssignee = useMemo(() => {
    const today = todayStr();
    const map = {};
    projectTasks.forEach((t) => {
      const assignees = t.assigneeName
        ? t.assigneeName.split(",").map((s) => s.trim()).filter(Boolean)
        : ["Unassigned"];

      assignees.forEach((assignee) => {
        const origKey = assignee;
        const lowerKey = origKey.toLowerCase();
        if (!map[lowerKey]) {
          map[lowerKey] = {
            assignee: origKey,
            tasks: 0,
            completed: 0,
            inProgress: 0,
            notStarted: 0,
            overdue: 0,
            days: 0,
            progressSum: 0
          };
        }

        const daysVal = Number(t.daysRequired);
        const progVal = Number(t.progress) || 0;

        map[lowerKey].tasks++;
        map[lowerKey].days += isNaN(daysVal) ? 0 : daysVal;
        map[lowerKey].progressSum += isNaN(progVal) ? 0 : progVal;

        if (progVal === 100) {
          map[lowerKey].completed++;
        } else if (progVal > 0) {
          map[lowerKey].inProgress++;
        } else {
          map[lowerKey].notStarted++;
        }

        if (t.endDate && t.endDate < today && progVal < 100) {
          map[lowerKey].overdue++;
        }
      });
    });
    return Object.values(map).map((p) => {
      const avg = p.tasks ? Math.round(p.progressSum / p.tasks) : 0;
      return {
        ...p,
        avgProgress: isNaN(avg) ? 0 : avg
      };
    });
  }, [projectTasks]);

  const byProject = useMemo(() => {
    const map = {};
    const filteredTasks = pChartStatusFilter === "All"
      ? projectTasks
      : projectTasks.filter(t => statusOf(t.progress) === pChartStatusFilter);

    filteredTasks.forEach((t) => {
      if (!t.project) return;
      const origKey = t.project.trim();
      const lowerKey = origKey.toLowerCase();
      if (!map[lowerKey]) {
        map[lowerKey] = {
          project: origKey,
          token: t.projectToken || "",
          tasks: 0,
          days: 0,
          progressSum: 0,
          statusCounts: { "Not Started": 0, "In Progress": 0, Completed: 0 }
        };
      }

      const daysVal = Number(t.daysRequired);
      const progVal = Number(t.progress);

      map[lowerKey].tasks++;
      map[lowerKey].days += isNaN(daysVal) ? 0 : daysVal;
      map[lowerKey].progressSum += isNaN(progVal) ? 0 : progVal;
      map[lowerKey].statusCounts[statusOf(progVal)]++;
    });
    return Object.values(map).map((p) => {
      const avg = p.tasks ? Math.round(p.progressSum / p.tasks) : 0;
      return {
        ...p,
        avgProgress: isNaN(avg) ? 0 : avg,
        displayName: p.project
      };
    });
  }, [projectTasks, pChartStatusFilter]);

  const invTotals = useMemo(() => {
    const c = {
      "Awaiting Operator Analysis": 0,
      "Escalated to Maintenance Supervisor": 0,
      "Maintenance in Progress": 0,
      "Ready to Begin Production": 0
    };
    let daysScope = 0;
    let count = 0;
    inventoryTasks.forEach((t) => {
      count++;
      const progressVal = Number(t.progress) || 0;
      const status = statusOf(progressVal, "inventory");
      c[status]++;
      const daysVal = Number(t.daysRequired);
      daysScope += isNaN(daysVal) ? 0 : daysVal;
    });
    return {
      totalTasks: count,
      daysScope,
      statusCounts: c,
    };
  }, [inventoryTasks]);

  const invOverdue = useMemo(() => {
    const today = todayStr();
    return inventoryTasks.filter((t) => t.endDate && t.endDate < today && Number(t.progress) < 100);
  }, [inventoryTasks]);

  const invByStageData = useMemo(() => {
    const stages = {
      "01-Breakdown": 0,
      "02-Escalation": 0,
      "03-Repair": 0,
      "04-Production": 0
    };
    inventoryTasks.forEach((t) => {
      const status = statusOf(t.progress, "inventory");
      if (status === "Awaiting Operator Analysis") stages["01-Breakdown"]++;
      else if (status === "Escalated to Maintenance Supervisor") stages["02-Escalation"]++;
      else if (status === "Maintenance in Progress") stages["03-Repair"]++;
      else if (status === "Ready to Begin Production") stages["04-Production"]++;
    });
    return Object.entries(stages).map(([stage, count]) => ({
      stageName: stage,
      Count: count
    }));
  }, [inventoryTasks]);

  const invByStatusData = useMemo(() => {
    const counts = {
      "Awaiting Operator Analysis": 0,
      "Escalated to Maintenance Supervisor": 0,
      "Maintenance in Progress": 0,
      "Ready to Begin Production": 0
    };
    inventoryTasks.forEach((t) => {
      const status = statusOf(t.progress, "inventory");
      counts[status]++;
    });
    return Object.entries(counts).map(([status, count]) => ({
      name: status,
      value: count
    })).filter(item => item.value > 0);
  }, [inventoryTasks]);

  const invSectionBreakdownTimeData = useMemo(() => {
    const map = {};
    inventoryTasks.forEach((t) => {
      if (t.task === "__init__") return;
      const section = t.project || "Unspecified Section";
      const hours = Number(t.daysRequired) || 0;
      map[section] = (map[section] || 0) + hours;
    });

    return Object.entries(map)
      .map(([section, totalHours]) => ({
        section,
        totalHours: Number(totalHours.toFixed(2)),
        name: section,
        value: Number(totalHours.toFixed(2))
      }))
      .filter((item) => item.totalHours > 0)
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [inventoryTasks]);
  const filteredInventoryTasks = useMemo(() => {
    let list = inventoryTasks;
    if (selectedInventorySection) {
      list = list.filter(t => t.project && t.project.toLowerCase() === selectedInventorySection.toLowerCase());
    }
    if (invStatusFilter !== "All") {
      list = list.filter(t => statusOf(t.progress, "inventory") === invStatusFilter);
    }
    if (invAssigneeFilter !== "All") {
      list = list.filter(t => t.assigneeName && t.assigneeName.toLowerCase().split(",").map(s => s.trim()).includes(invAssigneeFilter.toLowerCase()));
    }
    if (invFromDate) {
      list = list.filter(t => (t.endDate || t.startDate) >= invFromDate);
    }
    if (invToDate) {
      list = list.filter(t => (t.startDate || t.endDate) <= invToDate);
    }
    const query = invSearch.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (t) =>
          (t.task || "").toLowerCase().includes(query) ||
          (t.project || "").toLowerCase().includes(query) ||
          (t.machineryPart || t.machinery_part || "").toLowerCase().includes(query) ||
          (t.assigneeName || "").toLowerCase().includes(query) ||
          (t.description || "").toLowerCase().includes(query)
      );
    }
    return list;
  }, [inventoryTasks, selectedInventorySection, invStatusFilter, invAssigneeFilter, invFromDate, invToDate, invSearch]);

  const filteredMaintenanceTasks = useMemo(() => {
    let list = maintenanceTasks;
    if (mStatusFilter !== "All") {
      list = list.filter(t => statusOf(t.progress) === mStatusFilter);
    }
    if (mAssigneeFilter !== "All") {
      list = list.filter(t => t.assigneeName && t.assigneeName.toLowerCase().split(",").map(s => s.trim()).includes(mAssigneeFilter.toLowerCase()));
    }
    if (mFromDate) {
      list = list.filter(t => (t.endDate || t.startDate) >= mFromDate);
    }
    if (mToDate) {
      list = list.filter(t => t.startDate <= mToDate);
    }
    if (mSearch.trim()) {
      const q = mSearch.toLowerCase().trim();
      list = list.filter(t =>
        (t.task && t.task.toLowerCase().includes(q)) ||
        (t.project && t.project.toLowerCase().includes(q)) ||
        (t.location && t.location.toLowerCase().includes(q)) ||
        (t.assigneeName && t.assigneeName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [maintenanceTasks, mSearch, mStatusFilter, mAssigneeFilter, mFromDate, mToDate]);

  const filteredProjectsList = useMemo(() => {
    let list = projectsList;
    if (pStatusFilter !== "All") {
      list = list.filter(p => {
        const tasksInP = projectTasks.filter(t => t.project && t.project.toLowerCase() === p.toLowerCase());
        const avg = tasksInP.length ? Math.round(tasksInP.reduce((acc, t) => acc + t.progress, 0) / tasksInP.length) : 0;
        const status = avg >= 100 ? "Completed" : avg > 0 ? "In Progress" : "Not Started";
        return status === pStatusFilter;
      });
    }
    if (pAssigneeFilter !== "All") {
      list = list.filter(p => {
        const tasksInP = projectTasks.filter(t => t.project && t.project.toLowerCase() === p.toLowerCase());
        return tasksInP.some(t => t.assigneeName && t.assigneeName.toLowerCase().split(",").map(s => s.trim()).includes(pAssigneeFilter.toLowerCase()));
      });
    }
    if (pFromDate) {
      list = list.filter(p => {
        const tasksInP = projectTasks.filter(t => t.project && t.project.toLowerCase() === p.toLowerCase());
        const maxEnd = tasksInP.reduce((max, t) => {
          const end = t.endDate || t.startDate;
          return !max || end > max ? end : max;
        }, "");
        return maxEnd >= pFromDate;
      });
    }
    if (pToDate) {
      list = list.filter(p => {
        const tasksInP = projectTasks.filter(t => t.project && t.project.toLowerCase() === p.toLowerCase());
        const minStart = tasksInP.reduce((min, t) => {
          const start = t.startDate;
          return !min || start < min ? start : min;
        }, "");
        return minStart <= pToDate;
      });
    }
    if (pSearch.trim()) {
      const q = pSearch.toLowerCase().trim();
      list = list.filter(p => p.toLowerCase().includes(q));
    }
    return list;
  }, [projectsList, pSearch, pStatusFilter, pAssigneeFilter, projectTasks, tasks, pFromDate, pToDate]);

  const filteredProjectTasks = useMemo(() => {
    let list = projectTasks.filter(t => t.project && selectedProject && t.project.toLowerCase() === selectedProject.toLowerCase());
    if (tStatusFilter !== "All") {
      list = list.filter(t => statusOf(t.progress) === tStatusFilter);
    }
    if (tAssigneeFilter !== "All") {
      list = list.filter(t => t.assigneeName && t.assigneeName.toLowerCase().split(",").map(s => s.trim()).includes(tAssigneeFilter.toLowerCase()));
    }
    if (tFromDate) {
      list = list.filter(t => (t.endDate || t.startDate) >= tFromDate);
    }
    if (tToDate) {
      list = list.filter(t => t.startDate <= tToDate);
    }
    if (tSearch.trim()) {
      const q = tSearch.toLowerCase().trim();
      list = list.filter(t =>
        (t.task && t.task.toLowerCase().includes(q)) ||
        (t.projectToken && t.projectToken.toLowerCase().includes(q)) ||
        (t.location && t.location.toLowerCase().includes(q)) ||
        (t.assigneeName && t.assigneeName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [projectTasks, selectedProject, tSearch, tStatusFilter, tAssigneeFilter, tFromDate, tToDate]);

  function handleExportMaintenanceTasks() {
    const data = filteredMaintenanceTasks.map((t) => ({
      "Task ID": t.id,
      "Machinery / Location": t.project || "—",
      "Task Title": t.task || "—",
      "Assignee": t.assigneeName || t.location || "—",
      "Start Date": t.startDate || "—",
      "Target End Date": t.endDate || "—",
      "Days Scope": t.daysRequired || 0,
      "Progress (%)": `${t.progress}%`,
      "Status": statusOf(t.progress),
      "Description": t.description || "—",
      "Created By": t.createdBy || "—"
    }));
    exportToExcel(data, "Maintenance_Tasks_Report", "Maintenance Tasks");
  }

  function handleExportProjectTasks() {
    const listToExport = selectedProject ? filteredProjectTasks : projectTasks;
    const data = listToExport.map((t) => ({
      "Project Name": t.project || "—",
      "Task Title": t.task || "—",
      "Assignee": t.assigneeName || t.location || "—",
      "Start Date": t.startDate || "—",
      "Target End Date": t.endDate || "—",
      "Days Scope": t.daysRequired || 0,
      "Progress (%)": `${t.progress}%`,
      "Status": statusOf(t.progress),
      "Description": t.description || "—",
      "Created By": t.createdBy || "—"
    }));
    const pTitle = selectedProject ? `Project_${selectedProject.replace(/[^a-zA-Z0-9]/g, "_")}` : "Projects_List_Report";
    exportToExcel(data, pTitle, "Projects");
  }

  function handleExportInventoryTasks() {
    const listToExport = selectedInventorySection ? filteredInventoryTasks : inventoryTasks;
    const data = listToExport.map((t) => {
      const faultTypes = [];
      if (t.electricalFault) faultTypes.push("Electrical");
      if (t.mechanicalFault) faultTypes.push("Mechanical");
      const faultStr = faultTypes.join(" & ") || t.faultType || "—";

      return {
        "Task ID": t.id,
        "Machinery Section": t.project || "—",
        "Machinery Name": t.task || "—",
        "Machinery Part": t.machineryPart || "—",
        "Fault Type": faultStr,
        "Assignee": t.assigneeName || "—",
        "Breakdown Start Date": t.startDate || "—",
        "Breakdown Time": t.breakdownTime || "—",
        "Breakdown End Date": t.endDate || "—",
        "Breakdown End Time": t.breakdownEndTime || "—",
        "Total Down Hours": Number(t.daysRequired) || 0,
        "Impact Level": t.location || "—",
        "Status": statusOf(t.progress, "inventory"),
        "Description": t.description || "—",
        "Created By": t.createdBy || "—"
      };
    });
    const secTitle = selectedInventorySection ? `Breakdown_${selectedInventorySection.replace(/[^a-zA-Z0-9]/g, "_")}` : "Inventory_Breakdown_Tasks_Report";
    exportToExcel(data, secTitle, "Breakdown Tasks");
  }

  if (loadingSession) {
    return (
      <div className="jd-app jd-loading" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0F1115", color: "#ECEAE5", fontFamily: "'Oswald', sans-serif" }}>
        <style>{CSS}</style>
        <div style={{ width: "36px", height: "36px", border: "3px solid rgba(255,255,255,0.1)", borderTop: "3px solid var(--accent, #F26430)", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: "16px" }} />
        <div style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "0.5px" }}>Loading dashboard...</div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }
  if (!session) {
    return (
      <Login
        users={users}
        onLogin={handleLogin}
        onResetPassword={async (username, newPassword) => {
          const next = users.map((u) =>
            u.username.trim().toLowerCase() === username.trim().toLowerCase()
              ? { ...u, password: newPassword }
              : u
          );
          await saveUsers(next);
        }}
      />
    );
  }

  return (
    <div className="jd-app">
      <style>{CSS}</style>

      {/* Universal Swipe Back Gesture Overlay */}
      {gestureActive && gestureProgress > 0.08 && (
        <div
          style={{
            position: "fixed",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            width: `${Math.min(65, 20 + gestureProgress * 45)}px`,
            height: "64px",
            borderTopRightRadius: "32px",
            borderBottomRightRadius: "32px",
            background: gestureProgress >= 0.6
              ? "linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.95))"
              : "rgba(15, 23, 42, 0.88)",
            backdropFilter: "blur(8px)",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            transition: "background 0.2s ease, width 0.1s ease",
            color: "#ffffff",
            pointerEvents: "none"
          }}
        >
          <div style={{
            transform: `scale(${0.7 + gestureProgress * 0.5}) translateX(${gestureProgress * 5}px)`,
            transition: "transform 0.1s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <ArrowLeft size={22} color="#ffffff" strokeWidth={2.8} />
          </div>
        </div>
      )}
      <div className="jd-sticky-header">
        <header className="jd-header">
          <div
            className="jd-brand"
            onClick={() => setView(session?.role === "maintenance" ? "maintenance" : "m-dashboard")}
            style={{ cursor: "pointer", userSelect: "none" }}
            title={session?.role === "maintenance" ? "Go to Maintenance Tasks" : "Go to Maintenance Dashboard"}
          >
            <img src={logo} alt="RMP Logo" className="jd-header-logo" />
            <div>
              <div className="jd-brand-title">RMP ENGINEERING SYSTEM</div>
              <div className="jd-brand-sub">Maintainance &amp; Project Dashboard</div>
            </div>
          </div>
          <div className="jd-user">
            <span className="jd-user-name">
              <User size={14} /> {session.name}
            </span>
            <button type="button" className="jd-icon-btn jd-theme-btn" onClick={toggleTheme} title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`} style={{ marginRight: "4px" }}>
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="jd-icon-btn jd-hamburger" onClick={() => setMenuOpen(!menuOpen)} title="Toggle menu">
              <Menu size={16} />
            </button>
            <button className="jd-icon-btn jd-logout-btn" onClick={handleLogout} title="Log out">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {err && (
          <div className="jd-error-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{err}</span>
            <button type="button" onClick={() => setErr("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: "0 4px", display: "flex", alignItems: "center" }}>
              <X size={14} />
            </button>
          </div>
        )}

        <nav className="jd-tabs">
          {session.role !== "maintenance" && (
            <button className={view === "m-dashboard" ? "active" : ""} onClick={() => setView("m-dashboard")}>
              <LayoutGrid size={14} /> Maintenance Dashboard
            </button>
          )}
          <button className={view === "maintenance" ? "active" : ""} onClick={() => setView("maintenance")}>
            <ListChecks size={14} /> Maintenance Tasks
          </button>
          {session.role !== "maintenance" && (
            <>
              <button className={view === "p-dashboard" ? "active" : ""} onClick={() => setView("p-dashboard")}>
                <LayoutGrid size={14} /> Projects Dashboard
              </button>
              <button className={view === "projects" ? "active" : ""} onClick={() => { setView("projects"); setSelectedProject(""); }}>
                <ListChecks size={14} /> Projects List
              </button>
              <button className={view === "inv-dashboard" ? "active" : ""} onClick={() => setView("inv-dashboard")}>
                <LayoutGrid size={14} /> Breakdown Dashboard
              </button>
              <button className={view === "inventory" ? "active" : ""} onClick={() => { setView("inventory"); setSelectedInventorySection(""); }}>
                <ListChecks size={14} /> Breakdown Analysis
              </button>
              <button className={view === "machinery-directory" ? "active" : ""} onClick={() => setView("machinery-directory")}>
                <FolderOpen size={14} /> Machinery &amp; Parts
              </button>
              <button className={view === "vehicle-maintenance" ? "active" : ""} onClick={() => setView("vehicle-maintenance")}>
                <Truck size={14} /> Vehicle Maintenance
              </button>
            </>
          )}
          {session.role === "management" && (
            <button className={view === "users" ? "active" : ""} onClick={() => setView("users")}>
              <Users size={14} /> Users
            </button>
          )}
        </nav>
      </div>

      {/* Mobile Hamburger menu list */}
      {menuOpen && (
        <div className="jd-mobile-menu-overlay" onClick={() => setMenuOpen(false)}>
          <div className="jd-mobile-menu" onClick={(e) => e.stopPropagation()}>
            {session.role !== "maintenance" && (
              <button className={view === "m-dashboard" ? "active" : ""} onClick={() => { setView("m-dashboard"); setMenuOpen(false); }}>
                <LayoutGrid size={14} /> Maintenance Dashboard
              </button>
            )}
            <button className={view === "maintenance" ? "active" : ""} onClick={() => { setView("maintenance"); setMenuOpen(false); }}>
              <ListChecks size={14} /> Maintenance Tasks
            </button>
            {session.role !== "maintenance" && (
              <>
                <button className={view === "p-dashboard" ? "active" : ""} onClick={() => { setView("p-dashboard"); setMenuOpen(false); }}>
                  <LayoutGrid size={14} /> Projects Dashboard
                </button>
                <button className={view === "projects" ? "active" : ""} onClick={() => { setView("projects"); setSelectedProject(""); setMenuOpen(false); }}>
                  <ListChecks size={14} /> Projects List
                </button>
                <button className={view === "inv-dashboard" ? "active" : ""} onClick={() => { setView("inv-dashboard"); setMenuOpen(false); }}>
                  <LayoutGrid size={14} /> Breakdown Dashboard
                </button>
                <button className={view === "inventory" ? "active" : ""} onClick={() => { setView("inventory"); setSelectedInventorySection(""); setMenuOpen(false); }}>
                  <ListChecks size={14} /> Breakdown Analysis
                </button>
                <button className={view === "machinery-directory" ? "active" : ""} onClick={() => { setView("machinery-directory"); setMenuOpen(false); }}>
                  <FolderOpen size={14} /> Machinery &amp; Parts
                </button>
                <button className={view === "vehicle-maintenance" ? "active" : ""} onClick={() => { setView("vehicle-maintenance"); setMenuOpen(false); }}>
                  <Truck size={14} /> Vehicle Maintenance
                </button>
              </>
            )}
            {session.role === "management" && (
              <button className={view === "users" ? "active" : ""} onClick={() => { setView("users"); setMenuOpen(false); }}>
                <Users size={14} /> Users Panel
              </button>
            )}
            <button className="jd-mobile-menu-logout" onClick={() => { handleLogout(); setMenuOpen(false); }}>
              <LogOut size={14} /> Log Out
            </button>
          </div>
        </div>
      )}

      {view === "m-dashboard" && (
        <main className="jd-main">
          <div className="jd-stats">
            <StatCard label="Total Maintenance Tasks" value={mTotals.totalTasks} />
            <StatCard label="Days Scope" value={mTotals.daysScope} />
            <StatCard label="Not started" value={mTotals.statusCounts["Not Started"]} color={STATUS_COLOR["Not Started"]} />
            <StatCard label="In progress" value={mTotals.statusCounts["In Progress"]} color={STATUS_COLOR["In Progress"]} />
            <StatCard label="Completed" value={mTotals.statusCounts.Completed} color={STATUS_COLOR.Completed} />
          </div>

          <div className="jd-charts">
            <div className="jd-panel">
              <h4>Maintenance Task by Section</h4>
              <div style={{ position: "relative", width: "100%", minHeight: "360px" }}>
                <InfographicPieChart
                  data={mByTaskName}
                  dataKey="tasks"
                  nameKey="displayName"
                  centerTitle="SECTIONS"
                />
              </div>
            </div>

            <div className="jd-panel jd-panel-wide">
              <h4>Average progress by task</h4>
              <div style={{ position: "relative", width: "100%", height: "350px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mByTaskName} margin={{ top: 25, right: 15, left: -10, bottom: 75 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="displayName"
                      interval={0}
                      tick={({ x, y, payload }) => {
                        const label = payload.value;
                        const maxChars = window.innerWidth <= 768 ? 12 : 20;
                        const truncated = label.length > maxChars ? label.slice(0, maxChars - 2) + "…" : label;
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text
                              x={0}
                              y={0}
                              dy={12}
                              textAnchor="end"
                              fill="var(--text)"
                              fontSize={window.innerWidth <= 768 ? 9.5 : 11}
                              fontWeight={500}
                              transform="rotate(-30)"
                            >
                              <title>{label}</title>
                              {truncated}
                            </text>
                          </g>
                        );
                      }}
                    />
                    <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fill: "var(--text-dim)", fontSize: 10 }} unit="%" width={35} />
                    <Tooltip content={<CustomDarkTooltip unit="%" />} />
                    <Bar dataKey="avgProgress" shape={<Custom3DBar dataKey="avgProgress" />}>
                      {mByTaskName.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="jd-panel">
              <h4>Tasks by Assignee</h4>
              <div style={{ position: "relative", width: "100%", minHeight: "360px" }}>
                <InfographicPieChart
                  data={mByAssignee}
                  dataKey="tasks"
                  nameKey="assignee"
                  centerTitle="ASSIGNEES"
                />
              </div>
            </div>
          </div>

          <div className="jd-panel">
            <h4><AlertTriangle size={14} /> Overdue Maintenance Tasks ({mOverdue.length})</h4>
            {mOverdue.length === 0 ? (
              <p className="jd-empty-note">Nothing overdue right now.</p>
            ) : (
              <table className="jd-table">
                <thead>
                  <tr><th>Task No</th><th>Name</th><th>Location</th><th>Assignee</th><th>End date</th><th>Progress</th></tr>
                </thead>
                <tbody>
                  {mOverdue.map((t) => (
                    <tr key={t.id} onClick={() => handleEditTaskSelect(t)}>
                      <td><strong>{t.task}</strong></td>
                      <td>{t.project || "—"}</td>
                      <td>{t.location || "—"}</td>
                      <td>{t.assigneeName || "—"}</td>
                      <td className="jd-mono">{fmt(t.endDate)}</td>
                      <td>{t.progress}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="jd-two-col">
            <div className="jd-panel">
              <h4>By assignee</h4>
              <table className="jd-table">
                <thead>
                  <tr>
                    <th>Assignee</th>
                    <th>All</th>
                    <th>Completed</th>
                    <th>In Progress</th>
                    <th>Overdue</th>
                    <th>Days engaged</th>
                    <th>Avg progress</th>
                  </tr>
                </thead>
                <tbody>
                  {mByAssignee.map((p) => (
                    <tr key={p.assignee}>
                      <td><strong>{p.assignee}</strong></td>
                      <td><span className="jd-badge" style={{ background: "var(--panel-2)", color: "var(--text)" }}>{p.tasks}</span></td>
                      <td><span className="jd-badge" style={{ background: "rgba(61,163,93,0.15)", color: "#3da35d" }}>{p.completed}</span></td>
                      <td><span className="jd-badge" style={{ background: "rgba(242,100,48,0.15)", color: "#F26430" }}>{p.inProgress}</span></td>
                      <td><span className="jd-badge" style={{ background: "rgba(255,107,107,0.15)", color: "#ff6b6b" }}>{p.overdue}</span></td>
                      <td>{p.days}</td>
                      <td><ProgressBar value={p.avgProgress} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="jd-panel">
              <h4>By creator / engineer</h4>
              <table className="jd-table">
                <thead><tr><th>Creator / Engineer</th><th>Tasks</th><th>Days engaged</th><th>Avg progress</th></tr></thead>
                <tbody>
                  {mByCreator.map((p) => (
                    <tr key={p.creator}>
                      <td>{p.creator}</td>
                      <td>{p.tasks}</td>
                      <td>{p.days}</td>
                      <td><ProgressBar value={p.avgProgress} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {view === "p-dashboard" && (
        <main className="jd-main">
          <div className="jd-stats">
            <StatCard label="Projects" value={pTotals.totalProjects} />
            <StatCard label="Total project tasks" value={pTotals.totalTasks} />
            <StatCard label="Days scope" value={pTotals.daysScope} />
            <StatCard label="Not started" value={pTotals.statusCounts["Not Started"]} color={STATUS_COLOR["Not Started"]} />
            <StatCard label="In progress" value={pTotals.statusCounts["In Progress"]} color={STATUS_COLOR["In Progress"]} />
            <StatCard label="Completed" value={pTotals.statusCounts.Completed} color={STATUS_COLOR.Completed} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", marginTop: "10px", flexWrap: "wrap", gap: "12px" }}>
            <h4 style={{ margin: 0, fontFamily: "'Oswald', sans-serif", fontSize: "14px", color: "var(--accent)" }}>Charts Preview Filter</h4>
            <select
              className="jd-input"
              value={pChartStatusFilter}
              onChange={(e) => setPChartStatusFilter(e.target.value)}
              style={{ maxWidth: "220px", fontSize: "13px", padding: "6px 10px" }}
            >
              <option value="All">All Tasks</option>
              <option value="Not Started">Not Started Tasks</option>
              <option value="In Progress">In Progress Tasks</option>
              <option value="Completed">Completed Tasks</option>
            </select>
          </div>

          <div className="jd-charts">
            <div className="jd-panel jd-panel-wide">
              <h4>Average progress by project</h4>
              <div style={{ position: "relative", width: "100%", height: "350px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byProject} margin={{ top: 25, right: 15, left: -10, bottom: 75 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="displayName"
                      interval={0}
                      tick={({ x, y, payload }) => {
                        const label = payload.value;
                        const maxChars = window.innerWidth <= 768 ? 12 : 20;
                        const truncated = label.length > maxChars ? label.slice(0, maxChars - 2) + "…" : label;
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text
                              x={0}
                              y={0}
                              dy={12}
                              textAnchor="end"
                              fill="var(--text)"
                              fontSize={window.innerWidth <= 768 ? 9.5 : 11}
                              fontWeight={500}
                              transform="rotate(-30)"
                            >
                              <title>{label}</title>
                              {truncated}
                            </text>
                          </g>
                        );
                      }}
                    />
                    <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fill: "var(--text-dim)", fontSize: 10 }} unit="%" width={35} />
                    <Tooltip content={<CustomDarkTooltip unit="%" />} />
                    <Bar dataKey="avgProgress" shape={<Custom3DBar dataKey="avgProgress" />}>
                      {byProject.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="jd-panel">
              <h4>Tasks by Project</h4>
              <div style={{ position: "relative", width: "100%", height: "300px" }}>
                <InfographicPieChart
                  data={byProject}
                  dataKey="tasks"
                  nameKey="displayName"
                  centerTitle="PROJECTS"
                />
              </div>
            </div>
          </div>

          <div className="jd-panel">
            <h4><AlertTriangle size={14} /> Overdue Project Tasks ({pOverdue.length})</h4>
            {pOverdue.length === 0 ? (
              <p className="jd-empty-note">Nothing overdue right now.</p>
            ) : (
              <table className="jd-table">
                <thead>
                  <tr><th>Project</th><th>Task No</th><th>Location</th><th>Assignee</th><th>End date</th><th>Progress</th></tr>
                </thead>
                <tbody>
                  {pOverdue.map((t) => (
                    <tr key={t.id} onClick={() => handleEditTaskSelect(t)}>
                      <td>{t.project}</td>
                      <td><strong>{t.task}</strong></td>
                      <td>{t.location || "—"}</td>
                      <td>{t.assigneeName || "—"}</td>
                      <td className="jd-mono">{fmt(t.endDate)}</td>
                      <td>{t.progress}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="jd-two-col">
            <div className="jd-panel">
              <h4>By project</h4>
              <table className="jd-table">
                <thead><tr><th>Project</th><th>Tasks</th><th>Task Breakdown</th><th>Days</th><th>Avg progress</th></tr></thead>
                <tbody>
                  {byProject.map((p) => (
                    <tr key={p.project}>
                      <td>{p.project}</td>
                      <td>{p.tasks}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <ProjectStatusCircle
                            notStarted={p.statusCounts["Not Started"]}
                            inProgress={p.statusCounts["In Progress"]}
                            completed={p.statusCounts.Completed}
                          />
                          <span style={{ fontSize: "11.5px", color: "#9BA1AA" }}>
                            {p.statusCounts.Completed} / {p.statusCounts["In Progress"]} / {p.statusCounts["Not Started"]}
                          </span>
                        </div>
                      </td>
                      <td>{p.days}</td>
                      <td><ProgressBar value={p.avgProgress} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="jd-panel">
              <h4>By assignee</h4>
              <table className="jd-table">
                <thead>
                  <tr>
                    <th>Assignee</th>
                    <th>All</th>
                    <th>Completed</th>
                    <th>In Progress</th>
                    <th>Overdue</th>
                    <th>Days engaged</th>
                    <th>Avg progress</th>
                  </tr>
                </thead>
                <tbody>
                  {pByAssignee.map((p) => (
                    <tr key={p.assignee}>
                      <td><strong>{p.assignee}</strong></td>
                      <td><span className="jd-badge" style={{ background: "rgba(255,255,255,0.06)", color: "#ECEAE5" }}>{p.tasks}</span></td>
                      <td><span className="jd-badge" style={{ background: "rgba(61,163,93,0.15)", color: "#3da35d" }}>{p.completed}</span></td>
                      <td><span className="jd-badge" style={{ background: "rgba(242,100,48,0.15)", color: "#F26430" }}>{p.inProgress}</span></td>
                      <td><span className="jd-badge" style={{ background: "rgba(255,107,107,0.15)", color: "#ff6b6b" }}>{p.overdue}</span></td>
                      <td>{p.days}</td>
                      <td><ProgressBar value={p.avgProgress} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {view === "maintenance" && (
        <main className="jd-main">
          <div className="jd-stats">
            <StatCard label="Total Maintenance Tasks" value={maintenanceTasks.length} />
            <StatCard label="Days Scope" value={maintenanceTasks.reduce((acc, t) => acc + (Number(t.daysRequired) || 0), 0)} />
            <StatCard label="Not Started" value={maintenanceTasks.filter(t => statusOf(t.progress) === "Not Started").length} color={STATUS_COLOR["Not Started"]} />
            <StatCard label="In Progress" value={maintenanceTasks.filter(t => statusOf(t.progress) === "In Progress").length} color={STATUS_COLOR["In Progress"]} />
            <StatCard label="Completed" value={maintenanceTasks.filter(t => statusOf(t.progress) === "Completed").length} color={STATUS_COLOR.Completed} />
          </div>

          <div className="jd-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
              <h4 style={{ margin: 0 }}>Maintenance Tasks</h4>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", flex: 1, justifyContent: "flex-end", maxWidth: "880px" }}>
                <input
                  type="text"
                  className="jd-input"
                  value={mSearch}
                  onChange={(e) => setMSearch(e.target.value)}
                  placeholder="Search by Task No, Name, Location..."
                  style={{ flex: 2, minWidth: "160px", fontSize: "13px", padding: "6px 10px" }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "7px", padding: "2px 8px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>From:</span>
                  <input
                    type="date"
                    className="jd-input"
                    value={mFromDate}
                    onChange={(e) => setMFromDate(e.target.value)}
                    style={{ border: "none", background: "transparent", padding: "4px 0", width: "115px", fontSize: "12.5px" }}
                  />
                  {mFromDate && (
                    <button type="button" onClick={() => setMFromDate("")} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "7px", padding: "2px 8px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>To:</span>
                  <input
                    type="date"
                    className="jd-input"
                    value={mToDate}
                    onChange={(e) => setMToDate(e.target.value)}
                    style={{ border: "none", background: "transparent", padding: "4px 0", width: "115px", fontSize: "12.5px" }}
                  />
                  {mToDate && (
                    <button type="button" onClick={() => setMToDate("")} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                <select
                  className="jd-input"
                  value={mStatusFilter}
                  onChange={(e) => setMStatusFilter(e.target.value)}
                  style={{ flex: 1, minWidth: "120px", fontSize: "13px", padding: "6px 10px" }}
                >
                  <option value="All">All Statuses</option>
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
                <select
                  className="jd-input"
                  value={mAssigneeFilter}
                  onChange={(e) => setMAssigneeFilter(e.target.value)}
                  style={{ flex: 1, minWidth: "120px", fontSize: "13px", padding: "6px 10px" }}
                >
                  <option value="All">All Assignees</option>
                  {allAssigneeNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  className="jd-secondary-btn"
                  onClick={handleExportMaintenanceTasks}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", padding: "6px 12px", cursor: "pointer" }}
                >
                  <Download size={14} /> Export Excel
                </button>
                {(session.role === "management" || session.role === "maintenance") && (
                  <button className="jd-primary-btn" onClick={() => { setFormType("maintenance"); setEditTask(null); setShowForm(true); }}>
                    <Plus size={14} /> Add Maintenance Task
                  </button>
                )}
              </div>
            </div>

            {filteredMaintenanceTasks.length === 0 ? (
              <p className="jd-empty-note">No maintenance tasks found.</p>
            ) : (
              <div className="jd-table-container">
                <table className="jd-table jd-table-click">
                  <thead>
                    <tr>
                      <th>Task No</th>
                      <th>Name</th>
                      <th>Location</th>
                      <th>Assignee</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Days</th>
                      <th>Progress</th>
                      <th>Status</th>
                      <th>Photos</th>
                      <th>Created By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaintenanceTasks.map((t) => {
                      const overdueRow = t.endDate && t.endDate < todayStr() && t.progress < 100;
                      const taskPhotos = t.photos || [];
                      return (
                        <tr key={t.id} onClick={() => handleEditTaskSelect(t)} className={overdueRow ? "jd-row-overdue" : ""}>
                          <td>
                            <strong>{t.task}</strong>
                            {t.subTasks && t.subTasks.length > 0 && (
                              <div style={{ fontSize: "10.5px", color: "var(--text-dim)", fontWeight: "normal", marginTop: "2px" }}>
                                {t.subTasks.filter(st => st.completed).length}/{t.subTasks.length} sub-tasks
                              </div>
                            )}
                          </td>
                          <td>{t.project || "—"}</td>
                          <td>{t.location || "—"}</td>
                          <td>{t.assigneeName || "—"}</td>
                          <td className="jd-mono">{fmt(t.startDate)}</td>
                          <td className="jd-mono">{t.endDate ? fmt(t.endDate) : "—"}</td>
                          <td>{t.daysRequired || "—"}</td>
                          <td><ProgressBar value={t.progress} /></td>
                          <td>
                            <span className="jd-status-pill" style={{ "--c": STATUS_COLOR[statusOf(t.progress)] }}>
                              {statusOf(t.progress)}
                            </span>
                          </td>
                          <td>
                            {taskPhotos.length > 0 ? (
                              <div
                                style={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingPhotos({ title: `${t.task} — ${t.project || "Maintenance"}`, photos: taskPhotos });
                                }}
                              >
                                <img
                                  src={taskPhotos[0]}
                                  alt="Thumbnail"
                                  style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover", border: "1px solid var(--border)" }}
                                />
                                {taskPhotos.length > 1 && (
                                  <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text)", background: "var(--panel-2)", padding: "2px 6px", borderRadius: "10px", border: "1px solid var(--border)" }}>
                                    +{taskPhotos.length - 1}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: "var(--text-dim)", fontSize: "12px" }}>—</span>
                            )}
                          </td>
                          <td>{t.createdBy}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      )}

      {view === "projects" && (
        <main className="jd-main">
          {!selectedProject ? (
            <>
              <div className="jd-stats">
                <StatCard label="Total Projects" value={projectsList.length} />
                <StatCard label="Days Scope" value={projectTasks.reduce((acc, t) => acc + (Number(t.daysRequired) || 0), 0)} />
                <StatCard label="Not Started" value={projectTasks.filter(t => statusOf(t.progress) === "Not Started").length} color={STATUS_COLOR["Not Started"]} />
                <StatCard label="In Progress" value={projectTasks.filter(t => statusOf(t.progress) === "In Progress").length} color={STATUS_COLOR["In Progress"]} />
                <StatCard label="Completed" value={projectTasks.filter(t => statusOf(t.progress) === "Completed").length} color={STATUS_COLOR.Completed} />
              </div>

              <div className="jd-panel">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
                  <h4 style={{ margin: 0 }}>Projects</h4>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", flex: 1, justifyContent: "flex-end", maxWidth: "880px" }}>
                    <input
                      type="text"
                      className="jd-input"
                      value={pSearch}
                      onChange={(e) => setPSearch(e.target.value)}
                      placeholder="Search projects..."
                      style={{ flex: 2, minWidth: "160px", fontSize: "13px", padding: "6px 10px" }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "7px", padding: "2px 8px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>From:</span>
                      <input
                        type="date"
                        className="jd-input"
                        value={pFromDate}
                        onChange={(e) => setPFromDate(e.target.value)}
                        style={{ border: "none", background: "transparent", padding: "4px 0", width: "115px", fontSize: "12.5px" }}
                      />
                      {pFromDate && (
                        <button type="button" onClick={() => setPFromDate("")} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "7px", padding: "2px 8px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>To:</span>
                      <input
                        type="date"
                        className="jd-input"
                        value={pToDate}
                        onChange={(e) => setPToDate(e.target.value)}
                        style={{ border: "none", background: "transparent", padding: "4px 0", width: "115px", fontSize: "12.5px" }}
                      />
                      {pToDate && (
                        <button type="button" onClick={() => setPToDate("")} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <select
                      className="jd-input"
                      value={pStatusFilter}
                      onChange={(e) => setPStatusFilter(e.target.value)}
                      style={{ flex: 1, minWidth: "120px", fontSize: "13px", padding: "6px 10px" }}
                    >
                      <option value="All">All Statuses</option>
                      <option value="Not Started">Not Started</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                    </select>
                    <select
                      className="jd-input"
                      value={pAssigneeFilter}
                      onChange={(e) => setPAssigneeFilter(e.target.value)}
                      style={{ flex: 1, minWidth: "120px", fontSize: "13px", padding: "6px 10px" }}
                    >
                      <option value="All">All Assignees</option>
                      {allAssigneeNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      type="button"
                      className="jd-secondary-btn"
                      onClick={handleExportProjectTasks}
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", padding: "6px 12px", cursor: "pointer" }}
                    >
                      <Download size={14} /> Export Excel
                    </button>
                    {session.role === "management" && (
                      <button className="jd-primary-btn" onClick={() => setShowProjectForm(true)}>
                        <Plus size={14} /> Create Project
                      </button>
                    )}
                  </div>
                </div>

                {filteredProjectsList.length === 0 ? (
                  <p className="jd-empty-note">No projects found.</p>
                ) : (
                  <div className="jd-table-container">
                    <table className="jd-table jd-table-click">
                      <thead>
                        <tr>
                          <th>Project Name</th>
                          <th>Tasks Count</th>
                          <th>Average Progress</th>
                          <th>Task Breakdown</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProjectsList.map((p) => {
                          const tasksInP = projectTasks.filter(t => t.project === p);
                          const avg = tasksInP.length ? Math.round(tasksInP.reduce((acc, t) => acc + t.progress, 0) / tasksInP.length) : 0;
                          const status = avg >= 100 ? "Completed" : avg > 0 ? "In Progress" : "Not Started";

                          const nsCount = tasksInP.filter(t => statusOf(t.progress) === "Not Started").length;
                          const ipCount = tasksInP.filter(t => statusOf(t.progress) === "In Progress").length;
                          const cCount = tasksInP.filter(t => statusOf(t.progress) === "Completed").length;

                          return (
                            <tr key={p} onClick={() => setSelectedProject(p)}>
                              <td><strong>{p}</strong></td>
                              <td>{tasksInP.length} tasks</td>
                              <td><ProgressBar value={avg} /></td>
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <ProjectStatusCircle notStarted={nsCount} inProgress={ipCount} completed={cCount} />
                                  <div style={{ display: "flex", gap: "4px" }}>
                                    {cCount > 0 && (
                                      <span style={{ fontSize: "11px", fontWeight: "600", color: "#3da35d", background: "rgba(61, 163, 93, 0.12)", padding: "2px 5px", borderRadius: "3px" }}>
                                        {cCount}
                                      </span>
                                    )}
                                    {ipCount > 0 && (
                                      <span style={{ fontSize: "11px", fontWeight: "600", color: "#F26430", background: "rgba(242, 100, 48, 0.12)", padding: "2px 5px", borderRadius: "3px" }}>
                                        {ipCount}
                                      </span>
                                    )}
                                    {nsCount > 0 && (
                                      <span style={{ fontSize: "11px", fontWeight: "600", color: "#ff6b6b", background: "rgba(255, 107, 107, 0.12)", padding: "2px 5px", borderRadius: "3px" }}>
                                        {nsCount}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className="jd-status-pill" style={{ "--c": STATUS_COLOR[status] }}>
                                  {status}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: "8px" }} onClick={(e) => e.stopPropagation()}>
                                  <button className="jd-primary-btn" style={{ padding: "4px 8px", fontSize: "12px", gap: "4px" }} onClick={() => setSelectedProject(p)}>
                                    View Tasks
                                  </button>
                                  {session.role === "management" && (
                                    <button
                                      className="jd-danger-btn"
                                      style={{ padding: "4px 8px", fontSize: "12px", border: "1px solid #5c2b2b" }}
                                      onClick={async () => {
                                        if (confirm(`Are you sure you want to permanently delete project "${p}" and all its tasks?`)) {
                                          await saveTasks(tasks.filter(t => t.project !== p));
                                        }
                                      }}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Back Nav and Stats */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <button className="jd-icon-btn" onClick={() => setSelectedProject("")} style={{ display: "flex", alignContent: "center", padding: "6px 12px", fontSize: "13px" }}>
                  ← Back to Projects
                </button>
                <h3 style={{ margin: 0, fontFamily: "'Oswald', sans-serif" }}>{selectedProject}</h3>
              </div>

              {/* Project Stats */}
              <div className="jd-stats">
                <StatCard label="Tasks" value={projectTasks.filter(t => t.project && selectedProject && t.project.toLowerCase() === selectedProject.toLowerCase()).length} />
                <StatCard label="Days Scope" value={projectTasks.filter(t => t.project && selectedProject && t.project.toLowerCase() === selectedProject.toLowerCase()).reduce((acc, t) => acc + (Number(t.daysRequired) || 0), 0)} />
                <StatCard label="Not Started" value={projectTasks.filter(t => t.project && selectedProject && t.project.toLowerCase() === selectedProject.toLowerCase() && statusOf(t.progress) === "Not Started").length} color={STATUS_COLOR["Not Started"]} />
                <StatCard label="In Progress" value={projectTasks.filter(t => t.project && selectedProject && t.project.toLowerCase() === selectedProject.toLowerCase() && statusOf(t.progress) === "In Progress").length} color={STATUS_COLOR["In Progress"]} />
                <StatCard label="Completed" value={projectTasks.filter(t => t.project && selectedProject && t.project.toLowerCase() === selectedProject.toLowerCase() && statusOf(t.progress) === "Completed").length} color={STATUS_COLOR.Completed} />
              </div>

              {/* Project Tasks Table */}
              <div className="jd-panel">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
                  <h4 style={{ margin: 0 }}>Project Tasks</h4>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", flex: 1, justifyContent: "flex-end", maxWidth: "880px" }}>
                    <input
                      type="text"
                      className="jd-input"
                      value={tSearch}
                      onChange={(e) => setTSearch(e.target.value)}
                      placeholder="Search by Task Name, Location..."
                      style={{ flex: 2, minWidth: "160px", fontSize: "13px", padding: "6px 10px" }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "7px", padding: "2px 8px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>From:</span>
                      <input
                        type="date"
                        className="jd-input"
                        value={tFromDate}
                        onChange={(e) => setTFromDate(e.target.value)}
                        style={{ border: "none", background: "transparent", padding: "4px 0", width: "115px", fontSize: "12.5px" }}
                      />
                      {tFromDate && (
                        <button type="button" onClick={() => setTFromDate("")} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "7px", padding: "2px 8px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>To:</span>
                      <input
                        type="date"
                        className="jd-input"
                        value={tToDate}
                        onChange={(e) => setTToDate(e.target.value)}
                        style={{ border: "none", background: "transparent", padding: "4px 0", width: "115px", fontSize: "12.5px" }}
                      />
                      {tToDate && (
                        <button type="button" onClick={() => setTToDate("")} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <select
                      className="jd-input"
                      value={tStatusFilter}
                      onChange={(e) => setTStatusFilter(e.target.value)}
                      style={{ flex: 1, minWidth: "120px", fontSize: "13px", padding: "6px 10px" }}
                    >
                      <option value="All">All Statuses</option>
                      <option value="Not Started">Not Started</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                    </select>
                    <select
                      className="jd-input"
                      value={tAssigneeFilter}
                      onChange={(e) => setTAssigneeFilter(e.target.value)}
                      style={{ flex: 1, minWidth: "120px", fontSize: "13px", padding: "6px 10px" }}
                    >
                      <option value="All">All Assignees</option>
                      {allAssigneeNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      type="button"
                      className="jd-secondary-btn"
                      onClick={handleExportProjectTasks}
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", padding: "6px 12px", cursor: "pointer" }}
                    >
                      <Download size={14} /> Export Excel
                    </button>
                    {session.role === "management" && (
                      <button className="jd-primary-btn" onClick={() => { setFormType("project"); setEditTask(null); setShowForm(true); }}>
                        <Plus size={14} /> Add Project Task
                      </button>
                    )}
                  </div>
                </div>

                {filteredProjectTasks.length === 0 ? (
                  <p className="jd-empty-note">No tasks found in this project.</p>
                ) : (
                  <div className="jd-table-container">
                    <table className="jd-table jd-table-click">
                      <thead>
                        <tr>
                          <th>Task Name</th>
                          <th>Location</th>
                          <th>Assignee</th>
                          <th>Start Date</th>
                          <th>End Date</th>
                          <th>Days</th>
                          <th>Progress</th>
                          <th>Status</th>
                          <th>Photos</th>
                          <th>Created By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProjectTasks.map((t) => {
                          const overdueRow = t.endDate && t.endDate < todayStr() && t.progress < 100;
                          const taskPhotos = t.photos || [];
                          return (
                            <tr key={t.id} onClick={() => handleEditTaskSelect(t)} className={overdueRow ? "jd-row-overdue" : ""}>
                              <td>
                                <strong>{t.task}</strong>
                                {t.subTasks && t.subTasks.length > 0 && (
                                  <div style={{ fontSize: "10.5px", color: "var(--text-dim)", fontWeight: "normal", marginTop: "2px" }}>
                                    {t.subTasks.filter(st => st.completed).length}/{t.subTasks.length} sub-tasks
                                  </div>
                                )}
                              </td>
                              <td>{t.location || "—"}</td>
                              <td>{t.assigneeName || "—"}</td>
                              <td className="jd-mono">{fmt(t.startDate)}</td>
                              <td className="jd-mono">{t.endDate ? fmt(t.endDate) : "—"}</td>
                              <td>{t.daysRequired || "—"}</td>
                              <td><ProgressBar value={t.progress} /></td>
                              <td>
                                <span className="jd-status-pill" style={{ "--c": STATUS_COLOR[statusOf(t.progress)] }}>
                                  {statusOf(t.progress)}
                                </span>
                              </td>
                              <td>
                                {taskPhotos.length > 0 ? (
                                  <div
                                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewingPhotos({ title: `${t.task} — ${t.project}`, photos: taskPhotos });
                                    }}
                                  >
                                    <img
                                      src={taskPhotos[0]}
                                      alt="Thumbnail"
                                      style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover", border: "1px solid var(--border)" }}
                                    />
                                    {taskPhotos.length > 1 && (
                                      <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text)", background: "var(--panel-2)", padding: "2px 6px", borderRadius: "10px", border: "1px solid var(--border)" }}>
                                        +{taskPhotos.length - 1}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{ color: "var(--text-dim)", fontSize: "12px" }}>—</span>
                                )}
                              </td>
                              <td>{t.createdBy}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      )}

      {view === "inv-dashboard" && (
        <main className="jd-main">
          {/* Single Row 3-Column Header Grid across */}
          <div style={{ display: "grid", gridTemplateColumns: "0.7fr 2.15fr 2.15fr", gap: "16px", marginBottom: "20px" }} className="jd-inventory-header-grid">

            {/* 1. Active Tasks Card */}
            <div
              className="jd-panel"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "260px", padding: "16px 12px", textAlign: "center", cursor: "pointer" }}
              onClick={() => {
                setInvStatusFilter("All");
                setSelectedInventorySection("");
                setView("inventory");
              }}
              title="Click to view all Inventory Tasks"
            >
              <h4 style={{ margin: "0 0 16px 0", fontSize: "13px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Active Tasks</h4>
              <div style={{ fontSize: "72px", fontWeight: "700", color: "#7EA754", lineHeight: "1", fontFamily: "'Oswald', sans-serif" }}>
                {invTotals.totalTasks}
              </div>
            </div>

            {/* 2. Total Down Time by Section (Bar Chart) */}
            <div className="jd-panel" style={{ minHeight: "350px" }}>
              <h4 style={{ margin: "0 0 12px 0", textAlign: "center" }}>Total Down Time by Section (Bar Chart)</h4>
              <div style={{ position: "relative", width: "100%", height: "290px" }}>
                {invSectionBreakdownTimeData.length === 0 ? (
                  <p className="jd-empty-note" style={{ textAlign: "center", paddingTop: "60px" }}>No breakdown hours logged yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={invSectionBreakdownTimeData} margin={{ top: 25, right: 15, left: -10, bottom: 65 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="section"
                        interval={0}
                        tick={({ x, y, payload }) => {
                          const label = payload.value;
                          const maxChars = window.innerWidth <= 768 ? 11 : 18;
                          const truncated = label.length > maxChars ? label.slice(0, maxChars - 2) + "…" : label;
                          return (
                            <g transform={`translate(${x},${y})`}>
                              <text
                                x={0}
                                y={0}
                                dy={12}
                                textAnchor="end"
                                fill="var(--text-dim)"
                                fontSize={window.innerWidth <= 768 ? 9 : 10}
                                transform="rotate(-30)"
                              >
                                <title>{label}</title>
                                {truncated}
                              </text>
                            </g>
                          );
                        }}
                      />
                      <YAxis type="number" allowDecimals={true} tick={{ fill: "var(--text-dim)", fontSize: 10 }} tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)} width={38} unit="h" />
                      <Tooltip content={<CustomDarkTooltip unit="hrs" />} />
                      <Bar
                        dataKey="totalHours"
                        shape={<Custom3DBar dataKey="totalHours" />}
                        style={{ cursor: "pointer" }}
                        onClick={(data) => {
                          if (!data || !data.section) return;
                          setSelectedInventorySection(data.section);
                          setView("inventory");
                        }}
                      >
                        {invSectionBreakdownTimeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* 3. Down Time Proportion by Section (Pie Chart) */}
            <div className="jd-panel" style={{ minHeight: "360px" }}>
              <h4 style={{ margin: "0 0 12px 0", textAlign: "center" }}>Down Time Proportion by Section (Pie Chart)</h4>
              <div style={{ position: "relative", width: "100%", minHeight: "360px" }}>
                {invSectionBreakdownTimeData.length === 0 ? (
                  <p className="jd-empty-note" style={{ textAlign: "center", paddingTop: "60px" }}>No breakdown hours logged yet.</p>
                ) : (
                  <InfographicPieChart
                    data={invSectionBreakdownTimeData}
                    dataKey="value"
                    nameKey="name"
                    unit="hrs"
                    centerTitle="DOWN TIME"
                    onClick={(entry) => {
                      if (!entry) return;
                      const secName = entry.name || entry.displayName;
                      if (!secName) return;
                      setSelectedInventorySection(secName);
                      setView("inventory");
                    }}
                  />
                )}
              </div>
            </div>

          </div>

          <div className="jd-panel">
            <h4><AlertTriangle size={14} /> Overdue Breakdown Maintenance Tasks ({invOverdue.length})</h4>
            {invOverdue.length === 0 ? (
              <p className="jd-empty-note">Nothing overdue right now.</p>
            ) : (
              <div className="jd-table-container">
                <table className="jd-table">
                  <thead>
                    <tr>
                      <th>Machinery</th>
                      <th>Machinery Section</th>
                      <th>Assignee</th>
                      <th>Date &amp; Time of Breakdown</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invOverdue.map((t) => (
                      <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => { setSelectedInventorySection(t.project || ""); handleEditTaskSelect(t); setView("inventory"); }}>
                        <td><strong>{t.task}</strong></td>
                        <td>{t.project || "—"}</td>
                        <td>{t.assigneeName || "—"}</td>
                        <td className="jd-mono">{fmt(t.startDate)}{t.breakdownTime ? ` ${t.breakdownTime}` : ""}{t.breakdownEndTime ? ` – ${t.breakdownEndTime}` : ""}</td>
                        <td>
                          <span className="jd-status-pill" style={{ "--c": STATUS_COLOR[statusOf(t.progress, "inventory")] }}>
                            {statusOf(t.progress, "inventory")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      )}

      {view === "inventory" && (() => {
        if (!selectedInventorySection) {
          // 1. LIST OF MACHINERY SECTIONS VIEW
          return (
            <main className="jd-main">
              <div className="jd-stats">
                <StatCard label="Total Machinery Sections" value={inventoryItemsList.length} />
                <StatCard
                  label="Total Down Hours"
                  value={Math.round(inventoryTasks.reduce((acc, t) => acc + (Number(t.daysRequired) || 0), 0) * 100) / 100}
                />
                <StatCard
                  label="Awaiting Analysis"
                  value={inventoryTasks.filter(t => statusOf(t.progress, "inventory") === "Awaiting Operator Analysis").length}
                  color={STATUS_COLOR["Awaiting Operator Analysis"]}
                />
                <StatCard
                  label="Escalated"
                  value={inventoryTasks.filter(t => statusOf(t.progress, "inventory") === "Escalated to Maintenance Supervisor").length}
                  color={STATUS_COLOR["Escalated to Maintenance Supervisor"]}
                />
                <StatCard
                  label="In Progress"
                  value={inventoryTasks.filter(t => statusOf(t.progress, "inventory") === "Maintenance in Progress").length}
                  color={STATUS_COLOR["Maintenance in Progress"]}
                />
                <StatCard
                  label="Ready to Begin"
                  value={inventoryTasks.filter(t => statusOf(t.progress, "inventory") === "Ready to Begin Production").length}
                  color={STATUS_COLOR["Ready to Begin Production"]}
                />
              </div>

              <div className="jd-panel">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
                  <h4 style={{ margin: 0 }}>Machinery Section</h4>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", flex: 1, justifyContent: "flex-end", maxWidth: "880px" }}>
                    <input
                      type="text"
                      className="jd-input"
                      value={invSearch}
                      onChange={(e) => setInvSearch(e.target.value)}
                      placeholder="Search machinery sections..."
                      style={{ flex: 2, minWidth: "160px", fontSize: "13px", padding: "6px 10px" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      type="button"
                      className="jd-secondary-btn"
                      onClick={handleExportInventoryTasks}
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", padding: "6px 12px", cursor: "pointer" }}
                    >
                      <Download size={14} /> Export Excel
                    </button>
                    {session.role === "management" && (
                      <button
                        className="jd-primary-btn"
                        onClick={() => setShowInvForm(true)}
                      >
                        <Plus size={14} /> Add Machinery Section
                      </button>
                    )}
                  </div>
                </div>

                {filteredInventoryItemsList.length === 0 ? (
                  <p className="jd-empty-note">No machinery sections found.</p>
                ) : (
                  <table className="jd-table jd-table-click">
                    <thead>
                      <tr>
                        <th>Machinery Section Name</th>
                        <th>Breakdown Tasks Count</th>
                        <th>Total Down Hours</th>
                        <th>Awaiting Analysis</th>
                        <th>Escalated</th>
                        <th>In Progress</th>
                        <th>Ready to Begin Production</th>
                        {session.role === "management" && <th style={{ width: "50px" }}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInventoryItemsList.map((item) => {
                        const tasksInItem = inventoryTasks.filter(t => t.project === item && t.task !== "__init__");
                        const downHours = Math.round(tasksInItem.reduce((acc, t) => acc + (Number(t.daysRequired) || 0), 0) * 100) / 100;
                        const awaiting = tasksInItem.filter(t => statusOf(t.progress, "inventory") === "Awaiting Operator Analysis").length;
                        const escalated = tasksInItem.filter(t => statusOf(t.progress, "inventory") === "Escalated to Maintenance Supervisor").length;
                        const inProgress = tasksInItem.filter(t => statusOf(t.progress, "inventory") === "Maintenance in Progress").length;
                        const ready = tasksInItem.filter(t => statusOf(t.progress, "inventory") === "Ready to Begin Production").length;

                        return (
                          <tr key={item} onClick={() => setSelectedInventorySection(item)}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <FolderOpen size={16} style={{ color: "var(--accent)" }} />
                                <strong>{item}</strong>
                              </div>
                            </td>
                            <td>{tasksInItem.length} breakdown tasks</td>
                            <td>{downHours} hrs</td>
                            <td>
                              {awaiting > 0 ? (
                                <span style={{ fontSize: "11px", fontWeight: "600", color: "#ff6b6b", background: "rgba(255, 107, 107, 0.12)", padding: "2px 5px", borderRadius: "3px" }}>
                                  {awaiting}
                                </span>
                              ) : "—"}
                            </td>
                            <td>
                              {escalated > 0 ? (
                                <span style={{ fontSize: "11px", fontWeight: "600", color: "#10b981", background: "rgba(16, 185, 129, 0.12)", padding: "2px 5px", borderRadius: "3px" }}>
                                  {escalated}
                                </span>
                              ) : "—"}
                            </td>
                            <td>
                              {inProgress > 0 ? (
                                <span style={{ fontSize: "11px", fontWeight: "600", color: "#3b82f6", background: "rgba(59, 130, 246, 0.12)", padding: "2px 5px", borderRadius: "3px" }}>
                                  {inProgress}
                                </span>
                              ) : "—"}
                            </td>
                            <td>
                              {ready > 0 ? (
                                <span style={{ fontSize: "11px", fontWeight: "600", color: "#10b981", background: "rgba(16, 185, 129, 0.12)", padding: "2px 5px", borderRadius: "3px" }}>
                                  {ready}
                                </span>
                              ) : "—"}
                            </td>
                            {session.role === "management" && (
                              <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                                <button
                                  type="button"
                                  title="Edit machinery section name"
                                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", padding: "4px", borderRadius: "4px", display: "inline-flex", alignItems: "center", marginRight: "6px" }}
                                  onClick={() => setEditingInvItem(item)}
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Delete all tasks for this machinery section"
                                  style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "4px", borderRadius: "4px", display: "inline-flex", alignItems: "center" }}
                                  onClick={() => handleDeleteInventoryItem(item)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </main>
          );
        }

        // 2. DETAILED MACHINERY SECTION TASKS VIEW
        const grouped = {};
        filteredInventoryTasks.forEach((t) => {
          const key = t.project || "Unassigned";
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(t);
        });

        const currentAssetTasks = filteredInventoryTasks.filter(t => t.task !== "__init__");
        const downHoursSum = Math.round(currentAssetTasks.reduce((acc, t) => acc + (Number(t.daysRequired) || 0), 0) * 100) / 100;
        const awaitingCount = currentAssetTasks.filter(t => statusOf(t.progress, "inventory") === "Awaiting Operator Analysis").length;
        const escalatedCount = currentAssetTasks.filter(t => statusOf(t.progress, "inventory") === "Escalated to Maintenance Supervisor").length;
        const inProgressCount = currentAssetTasks.filter(t => statusOf(t.progress, "inventory") === "Maintenance in Progress").length;
        const readyCount = currentAssetTasks.filter(t => statusOf(t.progress, "inventory") === "Ready to Begin Production").length;

        return (
          <main className="jd-main">
            <button
              type="button"
              className="jd-chip-btn"
              style={{ width: "auto", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}
              onClick={() => setSelectedInventorySection("")}
            >
              ← Back to Machinery Section
            </button>

            <div className="jd-stats">
              <StatCard label="Total Tasks" value={currentAssetTasks.length} />
              <StatCard label="Total Down Hours" value={downHoursSum} />
              <StatCard label="Awaiting Analysis" value={awaitingCount} color={STATUS_COLOR["Awaiting Operator Analysis"]} />
              <StatCard label="Escalated" value={escalatedCount} color={STATUS_COLOR["Escalated to Maintenance Supervisor"]} />
              <StatCard label="In Progress" value={inProgressCount} color={STATUS_COLOR["Maintenance in Progress"]} />
              <StatCard label="Ready to Begin" value={readyCount} color={STATUS_COLOR["Ready to Begin Production"]} />
            </div>

            <div className="jd-panel" style={{ paddingBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h4 style={{ margin: 0, fontSize: "16px" }}>Breakdown Tasks: {selectedProject}</h4>
                  {session.role === "management" && (
                    <button
                      type="button"
                      title="Edit Machinery Section Name"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", padding: "4px", borderRadius: "4px", display: "inline-flex", alignItems: "center" }}
                      onClick={() => setEditingInvItem(selectedProject)}
                    >
                      <Edit2 size={14} />
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", flex: 1, justifyContent: "flex-end", maxWidth: "880px" }}>
                  <input
                    type="text"
                    className="jd-input"
                    value={invSearch}
                    onChange={(e) => setInvSearch(e.target.value)}
                    placeholder="Search tasks..."
                    style={{ flex: 2, minWidth: "160px", fontSize: "13px", padding: "6px 10px" }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "7px", padding: "2px 8px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>From:</span>
                    <input
                      type="date"
                      className="jd-input"
                      value={invFromDate}
                      onChange={(e) => setInvFromDate(e.target.value)}
                      style={{ border: "none", background: "transparent", padding: "4px 0", width: "115px", fontSize: "12.5px" }}
                    />
                    {invFromDate && (
                      <button type="button" onClick={() => setInvFromDate("")} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "7px", padding: "2px 8px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>To:</span>
                    <input
                      type="date"
                      className="jd-input"
                      value={invToDate}
                      onChange={(e) => setInvToDate(e.target.value)}
                      style={{ border: "none", background: "transparent", padding: "4px 0", width: "115px", fontSize: "12.5px" }}
                    />
                    {invToDate && (
                      <button type="button" onClick={() => setInvToDate("")} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <select
                    className="jd-input"
                    value={invStatusFilter}
                    onChange={(e) => setInvStatusFilter(e.target.value)}
                    style={{ flex: 1, minWidth: "120px", fontSize: "13px", padding: "6px 10px" }}
                  >
                    <option value="All">All Statuses</option>
                    <option value="Awaiting Operator Analysis">Awaiting Operator Analysis</option>
                    <option value="Escalated to Maintenance Supervisor">Escalated to Maintenance Supervisor</option>
                    <option value="Maintenance in Progress">Maintenance in Progress</option>
                    <option value="Ready to Begin Production">Ready to Begin Production</option>
                  </select>
                  <select
                    className="jd-input"
                    value={invAssigneeFilter}
                    onChange={(e) => setInvAssigneeFilter(e.target.value)}
                    style={{ flex: 1, minWidth: "120px", fontSize: "13px", padding: "6px 10px" }}
                  >
                    <option value="All">All Assignees</option>
                    {allAssigneeNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      type="button"
                      className="jd-secondary-btn"
                      onClick={handleExportInventoryTasks}
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", padding: "6px 12px", cursor: "pointer" }}
                    >
                      <Download size={14} /> Export Excel
                    </button>
                    {session.role === "management" && (
                      <button
                        className="jd-primary-btn"
                        onClick={() => {
                          setFormType("inventory");
                          setEditTask(null);
                          setShowForm(true);
                        }}
                      >
                        <Plus size={14} /> Report Breakdown
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="jd-table-container">
                <table className="jd-table jd-table-click jd-table-divided">
                  <thead>
                    <tr>
                      <th style={{ width: "20%" }}>Machinery</th>
                      <th style={{ width: "15%" }}>Machinery Part</th>
                      <th style={{ width: "12%" }}>Fault Type</th>
                      <th>Assignee</th>
                      <th>Date and Time of Breakdown</th>
                      <th>Fault Reason</th>
                      <th>Total Down Hours</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(grouped).map(([assetName, assetTasks]) => (
                      <Fragment key={assetName}>
                        {/* Folder Row for Asset */}
                        <tr style={{ background: "rgba(255,255,255,0.03)", fontWeight: "600", cursor: "default" }}>
                          <td colSpan={8} style={{ padding: "10px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>▼</span>
                                <FolderOpen size={16} style={{ color: "var(--accent)" }} />
                                <strong style={{ fontSize: "13.5px" }}>{assetName}</strong>
                                <span style={{ fontSize: "11px", fontWeight: "normal", background: "var(--panel-2)", color: "var(--text-dim)", padding: "2px 6px", borderRadius: "4px", marginLeft: "8px", border: "1px solid var(--border)" }}>
                                  Item Count: {assetTasks.filter(t => t.task !== "__init__").length}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* Tasks under this Asset */}
                        {assetTasks.filter(t => t.task !== "__init__").map((t) => {
                          const isMIP = statusOf(t.progress, "inventory") === "Maintenance in Progress";
                          const isEsc = statusOf(t.progress, "inventory") === "Escalated to Maintenance Supervisor";
                          const taskPhotos = t.photos || [];
                          const assigneesList = t.assigneeName
                            ? t.assigneeName.split(",").map((s) => s.trim()).filter(Boolean)
                            : [];

                          return (
                            <tr
                              key={t.id}
                              onClick={() => handleEditTaskSelect(t)}
                              style={{
                                background: isMIP ? "rgba(59, 130, 246, 0.08)" : isEsc ? "rgba(245, 158, 11, 0.08)" : "",
                                borderLeft: isMIP ? "4px solid #3b82f6" : isEsc ? "4px solid #f59e0b" : ""
                              }}
                            >
                              <td style={{ paddingLeft: "32px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <FileText size={15} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
                                    <div>
                                      <span style={{ fontSize: "13px", fontWeight: "500" }}>{t.task}</span>
                                      {t.subTasks && t.subTasks.length > 0 && (
                                        <div style={{ fontSize: "10.5px", color: "var(--text-dim)", fontWeight: "normal", marginTop: "2px" }}>
                                          {t.subTasks.filter(st => st.completed).length}/{t.subTasks.length} sub-tasks
                                        </div>
                                      )}
                                      {taskPhotos.length > 0 && (
                                        <div
                                          style={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer", marginTop: "4px" }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setViewingPhotos({ title: `${t.task} — ${t.project}`, photos: taskPhotos });
                                          }}
                                        >
                                          <span style={{ fontSize: "10.5px", color: "var(--accent)", textDecoration: "underline" }}>View Photos ({taskPhotos.length})</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {session.role === "management" && (
                                    <button
                                      type="button"
                                      title="Delete this breakdown task"
                                      style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "4px", borderRadius: "4px", display: "inline-flex", alignItems: "center", flexShrink: 0 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm(`Delete breakdown task "${t.task}"? This cannot be undone.`)) {
                                          deleteTask(t.id);
                                        }
                                      }}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              </td>

                              <td>
                                <span style={{ fontSize: "13px", color: (t.machineryPart || t.machinery_part) ? "var(--text)" : "var(--text-dim)" }}>
                                  {t.machineryPart || t.machinery_part || "—"}
                                </span>
                              </td>

                              <td>
                                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                                  {(t.electricalFault || (t.faultType || "").toLowerCase().includes("electrical")) && (
                                    <span style={{ fontSize: "10.5px", fontWeight: "600", color: "#3b82f6", background: "rgba(59, 130, 246, 0.12)", padding: "2px 6px", borderRadius: "4px", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                                      ⚡ Electrical
                                    </span>
                                  )}
                                  {(t.mechanicalFault || (t.faultType || "").toLowerCase().includes("mechanical")) && (
                                    <span style={{ fontSize: "10.5px", fontWeight: "600", color: "#f59e0b", background: "rgba(245, 158, 11, 0.12)", padding: "2px 6px", borderRadius: "4px", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
                                      ⚙️ Mechanical
                                    </span>
                                  )}
                                  {!t.electricalFault && !t.mechanicalFault && !t.faultType && <span style={{ color: "var(--text-dim)" }}>—</span>}
                                </div>
                              </td>

                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                  {assigneesList.map((name) => (
                                    <div key={name} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--panel-2)", padding: "2px 6px", borderRadius: "20px", border: "1px solid var(--border)" }}>
                                      <img
                                        src={`https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3b82f6&color=fff&rounded=true&size=24`}
                                        alt={name}
                                        style={{ width: "16px", height: "16px", borderRadius: "50%" }}
                                      />
                                      <span style={{ fontSize: "11.5px" }}>{name}</span>
                                    </div>
                                  ))}
                                  {assigneesList.length === 0 && <span style={{ color: "var(--text-dim)" }}>—</span>}
                                </div>
                              </td>
                              <td className="jd-mono">
                                {fmt(t.startDate)}
                                {t.breakdownTime ? ` ${t.breakdownTime}` : ""}
                                {t.breakdownEndTime ? ` – ${t.breakdownEndTime}` : ""}
                              </td>
                              <td>{t.description || "—"}</td>
                              <td>{Number(t.daysRequired) || 0} hrs</td>
                              <td>
                                <span className="jd-status-pill" style={{ "--c": STATUS_COLOR[statusOf(t.progress, "inventory")] }}>
                                  {statusOf(t.progress, "inventory")}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                    {Object.keys(grouped).length === 0 && (
                      <tr>
                        <td colSpan={8} className="jd-empty-note" style={{ textAlign: "center", padding: "24px" }}>
                          <div style={{ marginBottom: "10px" }}>No breakdown tasks found.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </main>
        );
      })()}

      {view === "machinery-directory" && (
        <MachineryDirectoryView
          inventoryItemsList={inventoryItemsList}
          inventoryTasks={inventoryTasks}
          session={session}
        />
      )}

      {(view === "vehicle-maintenance" || view === "vehicle") && (
        <main className="jd-main">
          <div className="jd-stats" style={{ marginBottom: "20px" }}>
            <StatCard label="Total Vehicle Logs" value={vehicleTasks.length} />
            <StatCard
              label="Total Cost (LKR)"
              value={`LKR ${vehicleTasks.reduce((acc, t) => acc + (Number(t.totalCost) || 0), 0).toLocaleString()}`}
            />
            <StatCard
              label="Service Count"
              value={vehicleTasks.filter(t => (t.serviceType || "Service") === "Service").length}
              color="#38bdf8"
            />
            <StatCard
              label="Repair Count"
              value={vehicleTasks.filter(t => t.serviceType === "Repair").length}
              color="#f59e0b"
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", background: "var(--panel)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border)", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
              <button
                type="button"
                onClick={() => setVViewMode("logs")}
                style={{
                  padding: "8px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  background: vViewMode === "logs" ? "var(--accent)" : "transparent",
                  color: vViewMode === "logs" ? "#fff" : "var(--text-dim)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "all 0.2s ease"
                }}
              >
                <ListChecks size={15} /> Maintenance Logs
              </button>
              <button
                type="button"
                onClick={() => setVViewMode("bar")}
                style={{
                  padding: "8px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  background: vViewMode === "bar" ? "var(--accent)" : "transparent",
                  color: vViewMode === "bar" ? "#fff" : "var(--text-dim)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "all 0.2s ease"
                }}
              >
                <BarChart2 size={15} /> Bar Graph (Total Cost)
              </button>
            </div>

            {vViewMode === "logs" && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="jd-btn jd-btn-secondary"
                  onClick={handleExportVehicleTasks}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <Download size={14} /> Export Report
                </button>
                {session.role === "management" && (
                  <button
                    type="button"
                    className="jd-btn jd-btn-primary"
                    onClick={() => {
                      setFormType("vehicle");
                      setEditTask(null);
                      setShowForm(true);
                    }}
                  >
                    <Plus size={14} /> Add Vehicle Record
                  </button>
                )}
              </div>
            )}
          </div>

          {vViewMode === "bar" ? (
            <div className="jd-panel">
              <h4 style={{ margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: "8px" }}>
                <BarChart2 size={16} color="var(--accent)" /> Vehicle-Wise Total Service Cost (LKR)
              </h4>
              <div style={{ position: "relative", width: "100%", height: "360px" }}>
                {vCostByVehicleData.length === 0 ? (
                  <p className="jd-empty-note" style={{ textAlign: "center", paddingTop: "100px" }}>No vehicle service costs logged yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={vCostByVehicleData} margin={{ top: 25, right: 15, left: 5, bottom: 75 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="vehicle"
                        interval={0}
                        tick={({ x, y, payload }) => {
                          const label = payload.value;
                          const maxChars = window.innerWidth <= 768 ? 12 : 18;
                          const truncated = label.length > maxChars ? label.slice(0, maxChars - 2) + "…" : label;
                          return (
                            <g transform={`translate(${x},${y})`}>
                              <text x={0} y={0} dy={12} textAnchor="end" fill="var(--text)" fontSize={window.innerWidth <= 768 ? 9.5 : 11} fontWeight={500} transform="rotate(-30)">
                                <title>{label}</title>
                                {truncated}
                              </text>
                            </g>
                          );
                        }}
                      />
                      <YAxis tick={{ fill: "var(--text-dim)", fontSize: 10 }} tickFormatter={(val) => (val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)} width={45} />
                      <Tooltip content={<CustomDarkTooltip unit="LKR" />} />
                      <Bar dataKey="totalCost" shape={<Custom3DBar dataKey="totalCost" />}>
                        {vCostByVehicleData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          ) : (
            <div className="jd-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
                <h4 style={{ margin: 0 }}><Truck size={16} /> Vehicle Maintenance Logs</h4>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", flex: 1, justifyContent: "flex-end" }}>
                  <input
                    type="text"
                    className="jd-input"
                    value={vSearch}
                    onChange={(e) => setVSearch(e.target.value)}
                    placeholder="Search vehicle / invoice / task / provider..."
                    style={{ width: "260px" }}
                  />
                  <select className="jd-input" value={vStatusFilter} onChange={(e) => setVStatusFilter(e.target.value)} style={{ width: "160px" }}>
                    <option value="All">All Types</option>
                    <option value="Service">Service</option>
                    <option value="Repair">Repair</option>
                  </select>
                </div>
              </div>

              {filteredVehicleTasks.length === 0 ? (
                <p className="jd-empty-note">No vehicle maintenance tasks recorded yet. Click "Add Vehicle Record" to create one.</p>
              ) : (
                <div className="jd-table-container">
                  <table className="jd-table">
                    <thead>
                      <tr>
                        <th>Vehicle Number</th>
                        <th>Invoice Number</th>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Maintenance Service Task</th>
                        <th>Meter Reading</th>
                        <th>Service Provider</th>
                        <th>Total Cost</th>
                        <th>Photos</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVehicleTasks.map((t) => (
                        <tr key={t.id}>
                          <td style={{ fontWeight: "700", color: "var(--accent)" }}>{t.project || "—"}</td>
                          <td style={{ fontWeight: "600", fontFamily: "monospace", color: "var(--text)" }}>{t.invoiceNo || "—"}</td>
                          <td>{fmt(t.startDate)}</td>
                          <td>
                            <span className="jd-badge" style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", border: "1px solid rgba(56, 189, 248, 0.3)" }}>
                              {t.serviceType || "Service"}
                            </span>
                          </td>
                          <td style={{ fontWeight: "500" }}>{t.task}</td>
                          <td>{t.meterReading || "—"}</td>
                          <td>{t.serviceProvider || "—"}</td>
                          <td style={{ fontWeight: "700", color: "#34d399" }}>
                            {t.totalCost ? `LKR ${Number(t.totalCost).toLocaleString()}` : "—"}
                          </td>
                          <td>
                            {t.photos && t.photos.length > 0 ? (
                              <button
                                type="button"
                                className="jd-chip-btn"
                                style={{ padding: "3px 8px", fontSize: "11px" }}
                                onClick={() => setViewingPhotos({ title: `${t.project || "Vehicle"} — Invoice #${t.invoiceNo || "N/A"}`, photos: t.photos })}
                              >
                                <ImageIcon size={12} /> {t.photos.length} Photos
                              </button>
                            ) : "—"}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button
                                type="button"
                                className="jd-icon-btn"
                                title="Edit Record"
                                onClick={() => handleEditTaskSelect(t)}
                              >
                                <Edit2 size={14} />
                              </button>
                              {session.role === "management" && (
                                <button
                                  type="button"
                                  className="jd-icon-btn"
                                  title="Delete Record"
                                  style={{ color: "#ef4444" }}
                                  onClick={() => deleteVehicleTask(t.id)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      )}

      {view === "users" && session.role === "management" && (
        <UserManagementPanel users={users} session={session} onSaveUsers={saveUsers} />
      )}

      {(showForm || editTask) && (() => {
        const canModifyTask =
          session.role === "management" ||
          (session.role === "maintenance" &&
            (!editTask || (editTask.createdBy || "").trim().toLowerCase() === (session.name || "").trim().toLowerCase()));

        return (
          <TaskFormModal
            initial={editTask}
            defaultType={formType}
            defaultProject={formType === "project" ? selectedProject : selectedInventorySection}
            assigneeNames={assigneeNames}
            userNames={users.map((u) => u.username)}
            inventoryItems={inventoryItemsList}
            serviceProviders={serviceProviders}
            onAddServiceProvider={handleAddServiceProvider}
            onDeleteServiceProvider={handleDeleteServiceProvider}
            vehicleNumbers={vehicleNumbers}
            onAddVehicleNumber={handleAddVehicleNumber}
            onDeleteVehicleNumber={handleDeleteVehicleNumber}
            readOnly={!canModifyTask}
            onClose={() => { setShowForm(false); setEditTask(null); }}
            onSave={(formType === "vehicle" || editTask?.projectToken === "vehicle") ? upsertVehicleTask : upsertTask}
            onDelete={editTask && canModifyTask ? () => (editTask.projectToken === "vehicle" ? deleteVehicleTask(editTask.id) : deleteTask(editTask.id)) : null}
            onQuickProgress={editTask && canModifyTask ? (p) => quickProgress(editTask.id, p) : null}
            onPreviewPhoto={(data) => setViewingPhotos(data)}
          />
        );
      })()}

      {showProjectForm && (
        <ProjectFormModal
          onClose={() => setShowProjectForm(false)}
          assigneeNames={assigneeNames}
          userNames={users.map((u) => u.username)}
          tasks={tasks}
          onPreviewPhoto={(data) => setViewingPhotos(data)}
          onSave={async (taskData) => {
            try {
              const now = new Date().toISOString();
              const nextList = [
                ...tasks,
                {
                  id: nextId(),
                  ...taskData,
                  createdBy: session.name,
                  createdAt: now,
                  updatedAt: now,
                },
              ];
              await saveTasks(nextList);
              setSelectedProject(taskData.project);
            } catch (e) {
              console.error("Save project error:", e);
            } finally {
              setShowProjectForm(false);
            }
          }}
        />
      )}

      {showInvForm && session.role === "management" && (
        <AddMachinerySectionModal
          onClose={() => setShowInvForm(false)}
          onSave={async (name) => {
            try {
              await handleCreateInventoryItem(name);
            } catch (e) {
              console.error("Create section error:", e);
            } finally {
              setShowInvForm(false);
            }
          }}
          tasks={tasks}
        />
      )}

      {editingInvItem && session.role === "management" && (
        <EditMachinerySectionModal
          initialName={editingInvItem}
          onClose={() => setEditingInvItem(null)}
          onSave={async (oldName, newName) => {
            try {
              await handleRenameInventoryItem(oldName, newName);
            } catch (e) {
              console.error("Rename section error:", e);
            } finally {
              setEditingInvItem(null);
            }
          }}
          tasks={tasks}
        />
      )}

      <PhotoViewerModal viewingData={viewingPhotos} onClose={() => setViewingPhotos(null)} />
    </div>
  );
}

function ProjectStatusCircle({ notStarted = 0, inProgress = 0, completed = 0 }) {
  const total = notStarted + inProgress + completed;
  if (total === 0) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" style={{ display: "block" }}>
        <circle cx="12" cy="12" r="8" fill="none" stroke="#343941" strokeWidth="4" />
      </svg>
    );
  }

  const r = 8;
  const cx = 12;
  const cy = 12;
  const circumference = 2 * Math.PI * r;

  const pctC = completed / total;
  const pctIP = inProgress / total;
  const pctNS = notStarted / total;

  const strokeC = circumference * pctC;
  const offsetC = 0;

  const strokeIP = circumference * pctIP;
  const offsetIP = strokeC;

  const strokeNS = circumference * pctNS;
  const offsetNS = strokeC + strokeIP;

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" style={{ transform: "rotate(-90deg)", display: "block" }}>
      {pctC > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#3da35d"
          strokeWidth="5"
          strokeDasharray={`${strokeC} ${circumference}`}
          strokeDashoffset={-offsetC}
        />
      )}
      {pctIP > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#F26430"
          strokeWidth="5"
          strokeDasharray={`${strokeIP} ${circumference}`}
          strokeDashoffset={-offsetIP}
        />
      )}
      {pctNS > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#ff6b6b"
          strokeWidth="5"
          strokeDasharray={`${strokeNS} ${circumference}`}
          strokeDashoffset={-offsetNS}
        />
      )}
    </svg>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="jd-stat" style={color ? { "--stat-color": color } : {}}>
      <div className="jd-stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="jd-stat-label">{label}</div>
    </div>
  );
}

function ProgressBar({ value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = v >= 100 ? STATUS_COLOR.Completed : v > 0 ? STATUS_COLOR["In Progress"] : STATUS_COLOR["Not Started"];
  return (
    <div className="jd-progress-wrap">
      <div className="jd-progress-track">
        <div className="jd-progress-fill" style={{ width: `${v}%`, background: color }} />
      </div>
      <span className="jd-progress-label">{v}%</span>
    </div>
  );
}

function Login({ users, onLogin, onResetPassword }) {
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("management");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function handleSubmit() {
    setError("");
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter your name.");
      return;
    }

    const userMatch = users.find(
      (u) => u.username.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (!userMatch) {
      setError("Username does not exist. Please check your spelling.");
      return;
    }

    if (userMatch.role !== role) {
      const roleLabel =
        userMatch.role === "management"
          ? "Management User"
          : userMatch.role === "maintenance"
            ? "Maintenance User"
            : "Normal User";
      setError(`This user is registered as a ${roleLabel}. Select the correct tab.`);
      return;
    }

    if (userMatch.password === password) {
      onLogin(userMatch.username, userMatch.role);
    } else {
      setError("Incorrect password. Please try again.");
    }
  }

  function handleReset(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const trimmedName = name.trim();
    const newPass = password.trim();
    if (!trimmedName || !newPass) {
      setError("Please fill in both fields.");
      return;
    }

    const match = users.find(u => u.username.trim().toLowerCase() === trimmedName.toLowerCase());
    if (!match) {
      setError("Username not found in system.");
      return;
    }

    onResetPassword(match.username, newPass);
    setSuccess(`Password successfully reset for ${match.username}! You can log in now.`);
    setName("");
    setPassword("");
    setTimeout(() => {
      setMode("login");
      setSuccess("");
    }, 2500);
  }

  function handleRoleChange(newRole) {
    setRole(newRole);
    setName("");
    setPassword("");
    setError("");
    setSuccess("");
  }

  if (mode === "forgot") {
    return (
      <div className="jd-app jd-login-screen" style={{ backgroundImage: `url(${loginBanner})` }}>
        <style>{CSS}</style>
        <form className="jd-login-card" onSubmit={handleReset}>
          <div className="jd-brand jd-login-brand-col">
            <img src={logo} alt="RMP Logo" className="jd-login-logo" />
            <div style={{ textAlign: "center" }}>
              <div className="jd-brand-title" style={{ fontSize: "18px" }}>RMP ENGINEERING SYSTEM</div>
              <div className="jd-brand-sub">Reset Password</div>
            </div>
          </div>

          <p className="jd-login-copy">Enter your registered username and set a new password.</p>

          <label className="jd-field-label">Username</label>
          <input className="jd-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lakshan" />

          <label className="jd-field-label">New Password</label>
          <input type="password" className="jd-input" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="e.g. RPM1234" />

          {error && <div style={{ color: "#ff6b6b", fontSize: "12.5px", marginTop: "10px", textAlign: "center" }}>{error}</div>}
          {success && <div style={{ color: "#3da35d", fontSize: "12.5px", marginTop: "10px", textAlign: "center" }}>{success}</div>}

          <button type="submit" className="jd-primary-btn jd-full" style={{ marginTop: "18px" }} disabled={!name.trim() || !password.trim()}>
            Reset Password
          </button>

          <div style={{ textAlign: "center", marginTop: "16px" }}>
            <button type="button" className="jd-link-btn" onClick={() => { setMode("login"); setName(""); setPassword(""); setError(""); setSuccess(""); }}>
              Back to Login
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="jd-app jd-login-screen" style={{ backgroundImage: `url(${loginBanner})` }}>
      <style>{CSS}</style>
      <form className="jd-login-card" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div className="jd-brand jd-login-brand-col">
          <img src={logo} alt="RMP Logo" className="jd-login-logo" />
          <div style={{ textAlign: "center" }}>
            <div className="jd-brand-title" style={{ fontSize: "18px" }}>RMP ENGINEERING SYSTEM</div>
            <div className="jd-brand-sub">Maintainance &amp; Project Dashboard</div>
          </div>
        </div>

        <div className="jd-login-tabs">
          <button
            type="button"
            className={role === "management" ? "active" : ""}
            onClick={() => handleRoleChange("management")}
          >
            Management Login
          </button>
          <button
            type="button"
            className={role === "maintenance" ? "active" : ""}
            onClick={() => handleRoleChange("maintenance")}
          >
            Maintenance Login
          </button>
          <button
            type="button"
            className={role === "normal" ? "active" : ""}
            onClick={() => handleRoleChange("normal")}
          >
            Normal User Login
          </button>
        </div>
        <label className="jd-field-label">Name</label>
        <input className="jd-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="" />

        <label className="jd-field-label">Password</label>
        <input type="password" className="jd-input" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="" />

        {error && <div style={{ color: "#ff6b6b", fontSize: "12.5px", marginTop: "10px", textAlign: "center" }}>{error}</div>}

        <button type="submit" className="jd-primary-btn jd-full" style={{ marginTop: "18px" }} disabled={!name.trim() || !password.trim()}>
          Enter the dashboard
        </button>

        <div style={{ textAlign: "center", marginTop: "16px" }}>
          <button type="button" className="jd-link-btn" onClick={() => { setMode("forgot"); setName(""); setPassword(""); setError(""); setSuccess(""); }}>
            Forgot Password?
          </button>
        </div>
      </form>
    </div>
  );
}

async function compressImage(file, maxWidth = 1000, maxHeight = 1000, quality = 0.6) {
  if (!file) throw new Error("No file provided");

  let processFile = file;
  const fileName = (file.name || "").toLowerCase();
  const fileType = (file.type || "").toLowerCase();

  const isHeic =
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif") ||
    fileType.includes("heic") ||
    fileType.includes("heif");

  if (isHeic) {
    try {
      const convertedBlob = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.85
      });
      processFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
    } catch (heicErr) {
      console.warn("heic2any conversion failed, attempting raw fallback:", heicErr);
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(processFile);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl);
        } catch (e) {
          console.warn("Canvas compression failed, using raw data URL fallback", e);
          resolve(event.target.result);
        }
      };
      img.onerror = (err) => {
        console.warn("Image load error, using raw data URL fallback", err);
        resolve(event.target.result);
      };
    };
    reader.onerror = (err) => reject(err);
  });
}

function PhotoViewerModal({ viewingData, onClose }) {
  const photos = useMemo(() => {
    if (!viewingData) return [];
    if (Array.isArray(viewingData)) return viewingData.filter(Boolean);
    if (typeof viewingData === "string") return [viewingData];
    if (viewingData.photos && Array.isArray(viewingData.photos)) return viewingData.photos.filter(Boolean);
    return [];
  }, [viewingData]);

  const title = useMemo(() => {
    if (viewingData && typeof viewingData === "object" && !Array.isArray(viewingData) && viewingData.title) {
      return viewingData.title;
    }
    return "Photo Preview";
  }, [viewingData]);

  const initialIdx = useMemo(() => {
    if (viewingData && typeof viewingData === "object" && !Array.isArray(viewingData) && typeof viewingData.initialIndex === "number") {
      return viewingData.initialIndex;
    }
    return 0;
  }, [viewingData]);

  const [index, setIndex] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);

  useEffect(() => {
    if (initialIdx >= 0 && initialIdx < photos.length) {
      setIndex(initialIdx);
    } else {
      setIndex(0);
    }
    setZoomScale(1);
  }, [viewingData, initialIdx, photos.length]);

  if (!viewingData || photos.length === 0) return null;

  const safeIndex = Math.min(Math.max(0, index), photos.length - 1);
  const current = photos[safeIndex] || photos[0];

  function handleDownload() {
    try {
      const link = document.createElement("a");
      link.href = current;
      link.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}_${safeIndex + 1}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Download failed:", e);
    }
  }

  function handleOpenNewTab() {
    try {
      const win = window.open();
      if (win) {
        win.document.write(`<img src="${current}" style="max-width:100%;height:auto;" />`);
      }
    } catch (e) {
      console.error("Open new tab failed:", e);
    }
  }

  return (
    <div className="jd-lightbox-overlay" onClick={onClose}>
      <div style={{ position: "absolute", top: 18, right: 22, display: "flex", gap: 8, zIndex: 101, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="jd-secondary-btn"
          style={{ padding: "6px 12px", fontSize: "12px", gap: "4px" }}
          onClick={(e) => { e.stopPropagation(); setZoomScale((z) => (z >= 2.5 ? 1 : z + 0.5)); }}
          title="Toggle Zoom"
        >
          Zoom: {Math.round(zoomScale * 100)}%
        </button>
        <button
          type="button"
          className="jd-secondary-btn"
          style={{ padding: "6px 12px", fontSize: "12px", gap: "4px" }}
          onClick={(e) => { e.stopPropagation(); handleOpenNewTab(); }}
          title="Open Original Photo in New Tab"
        >
          Full HD
        </button>
        <button
          type="button"
          className="jd-primary-btn"
          style={{ padding: "6px 14px", fontSize: "12px", gap: "6px", display: "inline-flex", alignItems: "center" }}
          onClick={(e) => { e.stopPropagation(); handleDownload(); }}
        >
          <Download size={14} /> Download
        </button>
        <button
          type="button"
          className="jd-icon-btn"
          style={{ background: "#262A31", color: "#fff", padding: "8px", borderRadius: "6px" }}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>

      {title && (
        <div style={{ position: "absolute", top: 20, left: 24, color: "#ECEAE5", fontSize: "15px", fontWeight: 600, fontFamily: "'Oswald', sans-serif" }}>
          {title} {photos.length > 1 ? `(${safeIndex + 1} of ${photos.length})` : ""}
        </div>
      )}

      <div
        className="jd-lightbox-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          maxHeight: "82vh",
          maxWidth: "92vw",
          overflow: zoomScale > 1 ? "auto" : "visible"
        }}
      >
        {photos.length > 1 && (
          <button
            type="button"
            className="jd-icon-btn"
            style={{ position: "absolute", left: -50, background: "rgba(30,33,38,0.85)", padding: "10px", borderRadius: "50%", color: "#fff", zIndex: 10, cursor: "pointer", border: "1px solid rgba(255,255,255,0.2)" }}
            onClick={() => { setIndex((safeIndex - 1 + photos.length) % photos.length); setZoomScale(1); }}
          >
            ←
          </button>
        )}

        <img
          src={current}
          alt={`Photo ${safeIndex + 1}`}
          className="jd-lightbox-img"
          onClick={() => setZoomScale((z) => (z >= 2.5 ? 1 : z + 0.5))}
          style={{
            maxHeight: zoomScale > 1 ? "none" : "80vh",
            maxWidth: zoomScale > 1 ? "none" : "90vw",
            transform: `scale(${zoomScale})`,
            transformOrigin: "center center",
            transition: "transform 0.2s ease-out",
            objectFit: "contain",
            borderRadius: "8px",
            boxShadow: "0 12px 36px rgba(0,0,0,0.7)",
            cursor: "zoom-in"
          }}
        />

        {photos.length > 1 && (
          <button
            type="button"
            className="jd-icon-btn"
            style={{ position: "absolute", right: -50, background: "rgba(30,33,38,0.85)", padding: "10px", borderRadius: "50%", color: "#fff", zIndex: 10, cursor: "pointer", border: "1px solid rgba(255,255,255,0.2)" }}
            onClick={() => { setIndex((safeIndex + 1) % photos.length); setZoomScale(1); }}
          >
            →
          </button>
        )}
      </div>

      {photos.length > 1 && (
        <div className="jd-lightbox-bar" onClick={(e) => e.stopPropagation()}>
          {photos.map((p, idx) => (
            <img
              key={idx}
              src={p}
              alt={`Thumb ${idx}`}
              className={`jd-lightbox-thumb ${idx === safeIndex ? "active" : ""}`}
              onClick={() => { setIndex(idx); setZoomScale(1); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssigneeSelector({ selected, onChange, readOnly, defaultAssignees = DEFAULT_ASSIGNEES }) {
  const [customInput, setCustomInput] = useState("");

  const toggleAssignee = (name) => {
    if (readOnly) return;
    if (selected.includes(name)) {
      onChange(selected.filter((x) => x !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  const addCustom = (e) => {
    if (e) e.preventDefault();
    if (readOnly) return;
    const name = customInput.trim();
    if (!name) return;
    if (!selected.includes(name)) {
      onChange([...selected, name]);
    }
    setCustomInput("");
  };

  return (
    <div className="jd-assignee-selector">
      <div className="jd-assignee-chips">
        {selected.map((name) => (
          <span key={name} className="jd-assignee-chip">
            {name}
            {!readOnly && (
              <button
                type="button"
                className="jd-assignee-chip-remove"
                onClick={() => toggleAssignee(name)}
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}
        {selected.length === 0 && (
          <span className="jd-assignee-empty">No assignees selected</span>
        )}
      </div>

      {!readOnly && (
        <>
          <div className="jd-assignee-list">
            {defaultAssignees.map((name) => {
              const isSelected = selected.includes(name);
              return (
                <label key={name} className="jd-assignee-list-item">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleAssignee(name)}
                  />
                  <span>{name}</span>
                </label>
              );
            })}
          </div>

          <div className="jd-custom-assignee-input-row" style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <input
              type="text"
              className="jd-input"
              style={{ flex: 1, margin: 0 }}
              placeholder="Add custom assignee..."
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
            <button
              type="button"
              className="jd-primary-btn"
              onClick={() => addCustom()}
              style={{ padding: "8px 12px" }}
            >
              Add
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TaskFormModal({ initial, defaultType, defaultProject, assigneeNames, userNames, inventoryItems = [], serviceProviders = [], onAddServiceProvider, onDeleteServiceProvider, vehicleNumbers = [], onAddVehicleNumber, onDeleteVehicleNumber, readOnly, onClose, onSave, onDelete, onQuickProgress, onPreviewPhoto }) {
  const rawType = initial ? initial.projectToken : defaultType;
  const isVehicleType = rawType === "vehicle" || rawType === "vehicle-maintenance" || defaultType === "vehicle" || defaultType === "vehicle-maintenance" || initial?.projectToken === "vehicle" || initial?.projectToken === "vehicle-maintenance";
  const type = isVehicleType ? "vehicle" : rawType;
  const isDropdownProject = type === "maintenance" || type === "inventory";

  const [selectedNameOption, setSelectedNameOption] = useState(() => {
    const val = initial?.project || defaultProject || "";
    const list = type === "inventory" ? inventoryItems : DEFAULT_NAMES;
    if (list.includes(val)) {
      return val;
    }
    if (!val) {
      return list.length > 0 ? list[0] : "__custom__";
    }
    return "__custom__";
  });
  const [customNameInput, setCustomNameInput] = useState(() => {
    const val = initial?.project || defaultProject || "";
    const list = type === "inventory" ? inventoryItems : DEFAULT_NAMES;
    return list.includes(val) ? "" : val;
  });

  const [task, setTask] = useState(initial?.task || "");
  const [machineryPart, setMachineryPart] = useState(initial?.machineryPart || initial?.machinery_part || "");

  const currentSection = (type === "inventory" && (defaultProject || initial?.project))
    ? (initial?.project || defaultProject)
    : (isDropdownProject
      ? (selectedNameOption === "__custom__" ? customNameInput.trim() : selectedNameOption)
      : (initial?.project || defaultProject || ""));

  const sectionMachineryList = getSectionDefaultMachinery(currentSection, type);
  const isSectionMachineryDropdown = type === "inventory" && sectionMachineryList !== null;

  const [selectedMachineryOption, setSelectedMachineryOption] = useState(() => {
    const val = initial?.task || "";
    if (sectionMachineryList && sectionMachineryList.includes(val)) return val;
    if (val) return "__custom__";
    return sectionMachineryList ? sectionMachineryList[0] : "";
  });
  const [customMachineryInput, setCustomMachineryInput] = useState(() => {
    const val = initial?.task || "";
    return (sectionMachineryList && sectionMachineryList.includes(val)) ? "" : val;
  });

  useEffect(() => {
    if (type === "inventory" && sectionMachineryList && sectionMachineryList.length > 0) {
      if (!selectedMachineryOption || (!sectionMachineryList.includes(selectedMachineryOption) && selectedMachineryOption !== "__custom__")) {
        const val = initial?.task || "";
        if (sectionMachineryList.includes(val)) {
          setSelectedMachineryOption(val);
        } else if (val) {
          setSelectedMachineryOption("__custom__");
          setCustomMachineryInput(val);
        } else {
          setSelectedMachineryOption(sectionMachineryList[0]);
        }
      }
    }
  }, [currentSection, type]);
  const [location, setLocation] = useState(() => {
    if (initial) return initial.location || "";
    if (type === "inventory") return "C: Little to No Financial Impact";
    return "";
  });
  const [selectedAssignees, setSelectedAssignees] = useState(() => {
    if (!initial?.assigneeName) return [];
    return initial.assigneeName.split(",").map(s => s.trim()).filter(Boolean);
  });
  const [noDate, setNoDate] = useState(() => {
    if (initial) {
      return !initial.startDate;
    }
    return false;
  });
  const [startDate, setStartDate] = useState(initial?.startDate || todayStr());
  const [breakdownTime, setBreakdownTime] = useState(initial?.breakdownTime || "09:00");
  const [endDateOverride, setEndDateOverride] = useState(() => {
    if (initial?.endDate) return initial.endDate;
    if (initial?.startDate && initial?.daysRequired) return addDays(initial.startDate, initial.daysRequired);
    return initial?.startDate || todayStr();
  });
  const [breakdownEndTime, setBreakdownEndTime] = useState(initial?.breakdownEndTime || "17:00");

  function calcDownHours(sDate, sTime, eDate, eTime) {
    if (!sDate) return "";
    const startStr = `${sDate}T${sTime || "00:00"}:00`;
    const endStr = `${eDate || sDate}T${eTime || sTime || "00:00"}:00`;
    const startDt = new Date(startStr);
    const endDt = new Date(endStr);
    if (isNaN(startDt.getTime()) || isNaN(endDt.getTime())) return "";
    const diffMs = endDt.getTime() - startDt.getTime();
    if (diffMs < 0) return 0;
    const hours = diffMs / (1000 * 60 * 60);
    return Math.round(hours * 100) / 100;
  }

  const [daysRequired, setDaysRequired] = useState(() => {
    if (initial?.daysRequired) return initial.daysRequired;
    const calc = calcDownHours(initial?.startDate || todayStr(), initial?.breakdownTime || "09:00", initial?.endDate || todayStr(), initial?.breakdownEndTime || "17:00");
    return calc || "";
  });
  const [progress, setProgress] = useState(initial?.progress ?? 0);
  const [photos, setPhotos] = useState(initial?.photos || []);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState(initial?.description || "");
  const [electricalFault, setElectricalFault] = useState(() => {
    if (!initial) return false;
    if (typeof initial.electricalFault === "boolean") return initial.electricalFault;
    return (initial.faultType || "").toLowerCase().includes("electrical");
  });
  const [mechanicalFault, setMechanicalFault] = useState(() => {
    if (!initial) return false;
    if (typeof initial.mechanicalFault === "boolean") return initial.mechanicalFault;
    return (initial.faultType || "").toLowerCase().includes("mechanical");
  });
  const [invoiceNo, setInvoiceNo] = useState(initial?.invoiceNo || "");
  const [serviceType, setServiceType] = useState(initial?.serviceType || "Service");
  const [meterReading, setMeterReading] = useState(initial?.meterReading || "");
  const [selectedProviderOption, setSelectedProviderOption] = useState(() => {
    const val = initial?.serviceProvider || "";
    if (serviceProviders.includes(val)) return val;
    if (val) return "__custom__";
    return serviceProviders.length > 0 ? serviceProviders[0] : "__custom__";
  });
  const [customProviderInput, setCustomProviderInput] = useState(() => {
    const val = initial?.serviceProvider || "";
    return serviceProviders.includes(val) ? "" : val;
  });

  const [selectedVehicleOption, setSelectedVehicleOption] = useState(() => {
    const val = initial?.project || defaultProject || "";
    if (vehicleNumbers.includes(val)) return val;
    if (val) return "__custom__";
    return vehicleNumbers.length > 0 ? vehicleNumbers[0] : "__custom__";
  });
  const [customVehicleInput, setCustomVehicleInput] = useState(() => {
    const val = initial?.project || defaultProject || "";
    return vehicleNumbers.includes(val) ? "" : val;
  });
  const [totalCost, setTotalCost] = useState(initial?.totalCost || "");
  const [subTasks, setSubTasks] = useState(initial?.subTasks || []);
  const [subTaskInput, setSubTaskInput] = useState("");

  const handleToggleSubTask = (idx) => {
    if (readOnly) return;
    const nextSubTasks = subTasks.map((st, i) => i === idx ? { ...st, completed: !st.completed } : st);
    setSubTasks(nextSubTasks);
    const completedCount = nextSubTasks.filter(st => st.completed).length;
    const totalCount = nextSubTasks.length;
    if (totalCount > 0) {
      setProgress(Math.round((completedCount / totalCount) * 100));
    }
  };

  const handleAddSubTask = (e) => {
    if (e) e.preventDefault();
    if (readOnly) return;
    const trimmed = subTaskInput.trim();
    if (!trimmed) return;
    const nextSubTasks = [...subTasks, { text: trimmed, completed: false }];
    setSubTasks(nextSubTasks);
    setSubTaskInput("");
    const completedCount = nextSubTasks.filter(st => st.completed).length;
    const totalCount = nextSubTasks.length;
    setProgress(Math.round((completedCount / totalCount) * 100));
  };

  const handleDeleteSubTask = (idx) => {
    if (readOnly) return;
    const nextSubTasks = subTasks.filter((_, i) => i !== idx);
    setSubTasks(nextSubTasks);
    const completedCount = nextSubTasks.filter(st => st.completed).length;
    const totalCount = nextSubTasks.length;
    if (totalCount > 0) {
      setProgress(Math.round((completedCount / totalCount) * 100));
    } else {
      setProgress(0);
    }
  };

  const computedEnd = endDateOverride || addDays(startDate, daysRequired);

  function submit() {
    if (readOnly) return;
    const finalTask = isSectionMachineryDropdown
      ? (selectedMachineryOption === "__custom__" ? customMachineryInput.trim() : selectedMachineryOption)
      : task.trim();

    if (!finalTask) {
      alert(type === "inventory" ? "Please select or enter a Machinery name." : "Please enter a Task No.");
      return;
    }
    const finalProject = isVehicleType
      ? (selectedVehicleOption === "__custom__" ? customVehicleInput.trim() : selectedVehicleOption)
      : ((type === "inventory" && (defaultProject || initial?.project))
        ? (initial?.project || defaultProject)
        : (type === "project" && (defaultProject || initial?.project))
          ? (initial?.project || defaultProject)
          : (isDropdownProject
            ? (selectedNameOption === "__custom__" ? customNameInput.trim() : selectedNameOption)
            : (customNameInput.trim() || initial?.project || defaultProject || "")));
    if (!finalProject) {
      alert(isVehicleType ? "Please select or enter a vehicle number." : "Please select or enter a project name.");
      return;
    }
    const finalEndDate = noDate
      ? null
      : (endDateOverride || (startDate && daysRequired ? addDays(startDate, daysRequired) : startDate));

    const finalServiceProvider = selectedProviderOption === "__custom__"
      ? customProviderInput.trim()
      : selectedProviderOption;

    if (selectedProviderOption === "__custom__" && finalServiceProvider && onAddServiceProvider) {
      onAddServiceProvider(finalServiceProvider);
    }

    if (isVehicleType && selectedVehicleOption === "__custom__" && finalProject && onAddVehicleNumber) {
      onAddVehicleNumber(finalProject);
    }

    onSave(
      {
        project: finalProject,
        projectToken: isVehicleType ? "vehicle" : type,
        task: finalTask,
        invoiceNo: invoiceNo.trim(),
        serviceType,
        meterReading: meterReading.trim(),
        serviceProvider: finalServiceProvider,
        totalCost: totalCost !== "" ? Number(totalCost) : 0,
        machineryPart: machineryPart.trim(),
        location: location.trim(),
        electricalFault,
        mechanicalFault,
        faultType: [electricalFault && "Electrical fault", mechanicalFault && "Mechanical fault"].filter(Boolean).join(", "),
        assigneeName: selectedAssignees.join(", "),
        startDate: noDate ? null : startDate,
        breakdownTime: noDate ? null : breakdownTime,
        breakdownEndTime: noDate ? null : breakdownEndTime,
        daysRequired: noDate ? 0 : (Number(daysRequired) || 0),
        endDateOverride: finalEndDate,
        endDate: finalEndDate,
        progress: Number(progress),
        photos,
        description,
        subTasks
      },
      initial?.id
    );
    onClose();
  }

  return (
    <div className="jd-modal-overlay" onClick={onClose}>
      <form className="jd-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="jd-modal-head">
          <h3>
            {initial
              ? (readOnly ? "View Task" : "Edit Task")
              : (type === "maintenance"
                ? "Add Maintenance Task"
                : type === "inventory"
                  ? (defaultProject ? `Report Breakdown under ${defaultProject}` : "Add Breakdown Task")
                  : isVehicleType
                    ? "Add Vehicle Maintenance Task"
                    : (defaultProject ? `Add Task under ${defaultProject}` : "Add Project Task")
              )
            }
          </h3>
          <button type="button" className="jd-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {isVehicleType ? (
          <>
            <div className="jd-form-row">
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label className="jd-field-label" style={{ margin: 0 }}>Vehicle Number</label>
                  {!readOnly && selectedVehicleOption !== "__custom__" && onDeleteVehicleNumber && (
                    <button
                      type="button"
                      style={{ background: "none", border: "none", color: "#ef4444", fontSize: "11px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px", padding: 0 }}
                      title="Delete selected vehicle number from dropdown"
                      onClick={() => {
                        if (window.confirm(`Delete "${selectedVehicleOption}" from the vehicle dropdown list?`)) {
                          onDeleteVehicleNumber(selectedVehicleOption);
                          const remaining = vehicleNumbers.filter(v => v !== selectedVehicleOption);
                          setSelectedVehicleOption(remaining.length > 0 ? remaining[0] : "__custom__");
                        }
                      }}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
                {readOnly ? (
                  <input className="jd-input" value={initial?.project || ""} disabled={true} />
                ) : (
                  <>
                    <select
                      className="jd-input"
                      value={selectedVehicleOption}
                      onChange={(e) => setSelectedVehicleOption(e.target.value)}
                    >
                      {vehicleNumbers.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                      <option value="__custom__">+ Custom Vehicle Number...</option>
                    </select>

                    {selectedVehicleOption === "__custom__" && (
                      <input
                        type="text"
                        className="jd-input"
                        value={customVehicleInput}
                        onChange={(e) => setCustomVehicleInput(e.target.value)}
                        placeholder="Enter custom vehicle number (e.g. NC-4589)..."
                        style={{ marginTop: "8px" }}
                      />
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="jd-field-label">Invoice Number</label>
                <input
                  type="text"
                  className="jd-input"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="e.g. INV-88401"
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="jd-form-row">
              <div>
                <label className="jd-field-label"><Calendar size={12} /> Date</label>
                <input
                  type="date"
                  className="jd-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div>
                <label className="jd-field-label">Type</label>
                <select
                  className="jd-input"
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  disabled={readOnly}
                >
                  <option value="Service">Service</option>
                  <option value="Repair">Repair</option>
                </select>
              </div>
            </div>

            <div>
              <label className="jd-field-label">Maintenance Service Task</label>
              <input
                type="text"
                className="jd-input"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="e.g. Engine Oil & Filter Replacement"
                disabled={readOnly}
              />
            </div>

            <div className="jd-form-row">
              <div>
                <label className="jd-field-label">Meter Reading</label>
                <input
                  type="text"
                  className="jd-input"
                  value={meterReading}
                  onChange={(e) => setMeterReading(e.target.value)}
                  placeholder="e.g. 145,200 km or 3,450 hrs"
                  disabled={readOnly}
                />
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label className="jd-field-label" style={{ margin: 0 }}>Service Provider</label>
                  {!readOnly && selectedProviderOption !== "__custom__" && onDeleteServiceProvider && (
                    <button
                      type="button"
                      style={{ background: "none", border: "none", color: "#ef4444", fontSize: "11px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px", padding: 0 }}
                      title="Delete selected service provider from dropdown"
                      onClick={() => {
                        if (window.confirm(`Delete "${selectedProviderOption}" from the dropdown list?`)) {
                          onDeleteServiceProvider(selectedProviderOption);
                          const remaining = serviceProviders.filter(p => p !== selectedProviderOption);
                          setSelectedProviderOption(remaining.length > 0 ? remaining[0] : "__custom__");
                        }
                      }}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
                {readOnly ? (
                  <input className="jd-input" value={initial?.serviceProvider || ""} disabled={true} />
                ) : (
                  <>
                    <select
                      className="jd-input"
                      value={selectedProviderOption}
                      onChange={(e) => setSelectedProviderOption(e.target.value)}
                    >
                      {serviceProviders.map((sp) => (
                        <option key={sp} value={sp}>{sp}</option>
                      ))}
                      <option value="__custom__">+ Custom Service Provider...</option>
                    </select>

                    {selectedProviderOption === "__custom__" && (
                      <input
                        type="text"
                        className="jd-input"
                        value={customProviderInput}
                        onChange={(e) => setCustomProviderInput(e.target.value)}
                        placeholder="Enter custom service provider name..."
                        style={{ marginTop: "8px" }}
                      />
                    )}
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="jd-field-label">Total Cost (LKR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="jd-input"
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                placeholder="e.g. 38500"
                disabled={readOnly}
              />
            </div>

            <div>
              <label className="jd-field-label">Description / Invoice Notes</label>
              <textarea
                className="jd-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter service details or invoice notes..."
                disabled={readOnly}
                style={{ minHeight: "80px", resize: "vertical" }}
              />
            </div>
          </>
        ) : (
          <>
            {isDropdownProject ? (
              <>
                <label className="jd-field-label">{type === "inventory" ? "Machinery Section" : "Name"}</label>
                {readOnly || (type === "inventory" && (defaultProject || initial?.project)) ? (
                  <input className="jd-input" value={initial?.project || defaultProject || ""} disabled={true} />
                ) : (
                  <>
                    <select
                      className="jd-input"
                      value={selectedNameOption}
                      onChange={(e) => setSelectedNameOption(e.target.value)}
                    >
                      {(type === "inventory" ? inventoryItems : DEFAULT_NAMES).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                      <option value="__custom__">Custom Name...</option>
                    </select>
                    {selectedNameOption === "__custom__" && (
                      <input
                        type="text"
                        className="jd-input"
                        value={customNameInput}
                        onChange={(e) => setCustomNameInput(e.target.value)}
                        placeholder={type === "inventory" ? "Enter custom machinery section name" : "Enter custom maintenance name"}
                        style={{ marginTop: "8px" }}
                      />
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <label className="jd-field-label">Project</label>
                {(defaultProject || initial?.project) ? (
                  <input className="jd-input" value={initial?.project || defaultProject || ""} disabled={true} />
                ) : (
                  <input
                    type="text"
                    className="jd-input"
                    value={customNameInput}
                    onChange={(e) => setCustomNameInput(e.target.value)}
                    placeholder="Enter Project Name"
                  />
                )}
              </>
            )}

            <label className="jd-field-label">{type === "inventory" ? "Machinery" : "Task Name"}</label>
            {isSectionMachineryDropdown ? (
              <>
                {readOnly ? (
                  <input className="jd-input" value={initial?.task || ""} disabled={true} />
                ) : (
                  <>
                    <select
                      className="jd-input"
                      value={selectedMachineryOption}
                      onChange={(e) => setSelectedMachineryOption(e.target.value)}
                    >
                      {sectionMachineryList.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                      <option value="__custom__">Custom Machinery...</option>
                    </select>
                    {selectedMachineryOption === "__custom__" && (
                      <input
                        type="text"
                        className="jd-input"
                        value={customMachineryInput}
                        onChange={(e) => setCustomMachineryInput(e.target.value)}
                        placeholder="Enter custom machinery name..."
                        style={{ marginTop: "8px" }}
                      />
                    )}
                  </>
                )}
              </>
            ) : (
              <input className="jd-input" value={task} onChange={(e) => setTask(e.target.value)} placeholder={type === "inventory" ? "e.g. Grinder A97" : "e.g. T-1001"} disabled={readOnly} />
            )}

            {type === "inventory" && (
              <>
                <label className="jd-field-label">Machinery Part</label>
                <input
                  className="jd-input"
                  value={machineryPart}
                  onChange={(e) => setMachineryPart(e.target.value)}
                  placeholder="e.g. Gearbox, Motor, Shaft..."
                  disabled={readOnly}
                />
              </>
            )}

            {type === "inventory" && (
              <>
                <label className="jd-field-label">Fault Type</label>
                <div style={{ display: "flex", gap: "20px", marginBottom: "14px", flexWrap: "wrap", background: "var(--panel-2)", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: readOnly ? "default" : "pointer", fontSize: "13.5px", color: "var(--text)", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      checked={electricalFault}
                      onChange={(e) => setElectricalFault(e.target.checked)}
                      disabled={readOnly}
                      style={{ accentColor: "var(--accent)", width: "16px", height: "16px", cursor: readOnly ? "default" : "pointer" }}
                    />
                    <span>⚡ Electrical fault</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: readOnly ? "default" : "pointer", fontSize: "13.5px", color: "var(--text)", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      checked={mechanicalFault}
                      onChange={(e) => setMechanicalFault(e.target.checked)}
                      disabled={readOnly}
                      style={{ accentColor: "var(--accent)", width: "16px", height: "16px", cursor: readOnly ? "default" : "pointer" }}
                    />
                    <span>⚙️ Mechanical fault</span>
                  </label>
                </div>
              </>
            )}

            {type !== "inventory" && (
              <>
                <label className="jd-field-label">Location</label>
                <input className="jd-input" list="jd-locations" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Factory Floor A" disabled={readOnly} />
                <datalist id="jd-locations">{assigneeNames.map((a) => <option key={a} value={a} />)}</datalist>
              </>
            )}

            <label className="jd-field-label">Assignee</label>
            <AssigneeSelector
              selected={selectedAssignees}
              onChange={setSelectedAssignees}
              readOnly={readOnly}
              defaultAssignees={type === "maintenance" || type === "inventory" ? DEFAULT_ASSIGNEES : DEFAULT_PROJECT_ASSIGNEES}
            />

            <label className="jd-field-label">{type === "inventory" ? "Fault Reason" : "Description"}</label>
            <textarea
              className="jd-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === "inventory" ? "Enter breakdown fault reason..." : "Enter task description details..."}
              disabled={readOnly}
              style={{ minHeight: "80px", resize: "vertical" }}
            />
          </>
        )}

        {type !== "inventory" && type !== "vehicle" && (
          <>
            <label className="jd-field-label">Sub-tasks</label>
            <div style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* Sub-tasks list */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "150px", overflowY: "auto" }}>
                {subTasks.map((st, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "4px 0" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: readOnly ? "default" : "pointer", fontSize: "13px", color: st.completed ? "var(--text-dim)" : "var(--text)", textDecoration: st.completed ? "line-through" : "none", flex: 1, userSelect: "none" }}>
                      <input
                        type="checkbox"
                        checked={st.completed}
                        onChange={() => handleToggleSubTask(idx)}
                        disabled={readOnly}
                        style={{ accentColor: "var(--accent)", width: "15px", height: "15px", cursor: readOnly ? "default" : "pointer" }}
                      />
                      <span>{st.text}</span>
                    </label>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSubTask(idx)}
                        style={{ background: "none", border: "none", color: "#ff6b6b", cursor: "pointer", display: "flex", alignItems: "center", padding: "4px" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
                {subTasks.length === 0 && (
                  <span style={{ fontSize: "12px", color: "var(--text-dim)", fontStyle: "italic" }}>No sub-tasks defined</span>
                )}
              </div>

              {/* Add Sub-task form */}
              {!readOnly && (
                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  <input
                    type="text"
                    className="jd-input"
                    style={{ flex: 1, margin: 0, padding: "6px 10px", fontSize: "12.5px" }}
                    placeholder="Add new sub-task..."
                    value={subTaskInput}
                    onChange={(e) => setSubTaskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddSubTask();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="jd-primary-btn"
                    onClick={handleAddSubTask}
                    style={{ padding: "6px 12px", fontSize: "12.5px" }}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {type !== "vehicle" && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "8px 0 16px" }}>
            <input
              type="checkbox"
              id="jd-no-date"
              checked={noDate}
              onChange={(e) => setNoDate(e.target.checked)}
              disabled={readOnly}
              style={{ accentColor: "var(--accent)", width: "15px", height: "15px", cursor: readOnly ? "default" : "pointer" }}
            />
            <label htmlFor="jd-no-date" style={{ fontSize: "13px", color: "var(--text)", cursor: readOnly ? "default" : "pointer", userSelect: "none" }}>
              No date for this task
            </label>
          </div>
        )}

        {type === "vehicle" ? null : type === "inventory" ? (
          <div style={{ opacity: noDate ? 0.5 : 1, pointerEvents: noDate ? "none" : "auto", display: "flex", flexDirection: "column", gap: "12px", marginBottom: "14px" }}>
            <div className="jd-form-row">
              <div>
                <label className="jd-field-label"><Calendar size={12} /> Start Date of Breakdown</label>
                <input
                  type="date"
                  className="jd-input"
                  value={noDate ? "" : startDate}
                  onChange={(e) => {
                    const newSDate = e.target.value;
                    setStartDate(newSDate);
                    const hours = calcDownHours(newSDate, breakdownTime, endDateOverride || newSDate, breakdownEndTime);
                    setDaysRequired(hours);
                  }}
                  disabled={readOnly || noDate}
                />
              </div>
              <div>
                <label className="jd-field-label">Start Time of Breakdown</label>
                <input
                  type="time"
                  className="jd-input"
                  value={noDate ? "" : breakdownTime}
                  onChange={(e) => {
                    const newSTime = e.target.value;
                    setBreakdownTime(newSTime);
                    const hours = calcDownHours(startDate, newSTime, endDateOverride || startDate, breakdownEndTime);
                    setDaysRequired(hours);
                  }}
                  disabled={readOnly || noDate}
                />
              </div>
            </div>

            <div className="jd-form-row">
              <div>
                <label className="jd-field-label"><Calendar size={12} /> End Date of Breakdown</label>
                <input
                  type="date"
                  className="jd-input"
                  value={noDate ? "" : (endDateOverride || startDate)}
                  onChange={(e) => {
                    const newEDate = e.target.value;
                    setEndDateOverride(newEDate);
                    const hours = calcDownHours(startDate, breakdownTime, newEDate, breakdownEndTime);
                    setDaysRequired(hours);
                  }}
                  disabled={readOnly || noDate}
                />
              </div>
              <div>
                <label className="jd-field-label">End Time of Breakdown</label>
                <input
                  type="time"
                  className="jd-input"
                  value={noDate ? "" : breakdownEndTime}
                  onChange={(e) => {
                    const newETime = e.target.value;
                    setBreakdownEndTime(newETime);
                    const hours = calcDownHours(startDate, breakdownTime, endDateOverride || startDate, newETime);
                    setDaysRequired(hours);
                  }}
                  disabled={readOnly || noDate}
                />
              </div>
            </div>

            <div>
              <label className="jd-field-label">Total Down Hours (auto-calculated)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="jd-input"
                value={noDate ? "" : daysRequired}
                onChange={(e) => setDaysRequired(e.target.value)}
                placeholder="Calculated automatically from Start & End Date/Time"
                disabled={readOnly || noDate}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="jd-form-row" style={{ opacity: noDate ? 0.5 : 1, pointerEvents: noDate ? "none" : "auto" }}>
              <div>
                <label className="jd-field-label"><Calendar size={12} /> Start date</label>
                <input
                  type="date"
                  className="jd-input"
                  value={noDate ? "" : startDate}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    setStartDate(newStart);
                    if (daysRequired && newStart) {
                      setEndDateOverride(addDays(newStart, daysRequired));
                    }
                  }}
                  disabled={readOnly || noDate}
                />
              </div>
              <div>
                <label className="jd-field-label">Days required</label>
                <input
                  type="number"
                  min="0"
                  className="jd-input"
                  value={noDate ? "" : daysRequired}
                  onChange={(e) => {
                    const newDays = e.target.value;
                    setDaysRequired(newDays);
                    if (startDate && newDays !== "") {
                      setEndDateOverride(addDays(startDate, newDays));
                    }
                  }}
                  placeholder="e.g. 6"
                  disabled={readOnly || noDate}
                />
              </div>
            </div>

            <div style={{ opacity: noDate ? 0.5 : 1, pointerEvents: noDate ? "none" : "auto" }}>
              <label className="jd-field-label">End date</label>
              <input
                type="date"
                className="jd-input"
                value={noDate ? "" : (endDateOverride || computedEnd)}
                onChange={(e) => {
                  const newEnd = e.target.value;
                  setEndDateOverride(newEnd);
                  if (startDate && newEnd) {
                    setDaysRequired(calcDaysBetween(startDate, newEnd));
                  }
                }}
                disabled={readOnly || noDate}
              />
            </div>
          </>
        )}

        {type === "vehicle" ? null : type === "inventory" ? (
          <>
            <label className="jd-field-label">Status</label>
            <select
              className="jd-input"
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              disabled={readOnly}
              style={{ marginBottom: "14px" }}
            >
              <option value={0}>Awaiting Operator Analysis</option>
              <option value={30}>Escalated to Maintenance Supervisor</option>
              <option value={60}>Maintenance in Progress</option>
              <option value={100}>Ready to Begin Production</option>
            </select>
          </>
        ) : (
          <>
            <label className="jd-field-label">Progress: {progress}%</label>
            <input type="range" min="0" max="100" step="5" value={progress} onChange={(e) => setProgress(e.target.value)} className="jd-slider" disabled={readOnly} />
            {!readOnly && onQuickProgress && (
              <div className="jd-quick-row" style={{ marginBottom: "14px" }}>
                {[0, 25, 50, 75, 100].map((p) => (
                  <button type="button" key={p} className="jd-chip-btn" onClick={() => { setProgress(p); onQuickProgress(p); }}>{p}%</button>
                ))}
              </div>
            )}
          </>
        )}

        <label className="jd-field-label"><Camera size={12} /> Photos ({photos.length})</label>
        {photos.length > 0 && (
          <div className="jd-photo-grid">
            {photos.map((p, idx) => (
              <div
                key={idx}
                className="jd-photo-thumb"
                onClick={() => onPreviewPhoto && onPreviewPhoto({ title: `${task} — ${initial?.project || defaultProject || "Photos"}`, photos, initialIndex: idx })}
              >
                <img src={p} alt={`Photo ${idx + 1}`} />
                {!readOnly && (
                  <button
                    type="button"
                    className="jd-photo-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhotos(photos.filter((_, i) => i !== idx));
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && (
          <label className="jd-photo-upload-btn">
            <Upload size={14} /> {uploading ? "Compressing & attaching..." : "Upload Photos"}
            <input
              type="file"
              accept="image/*,.heic,.heif,image/heic,image/heif"
              multiple
              style={{ display: "none" }}
              disabled={uploading}
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;
                setUploading(true);
                const compressedList = [];
                for (const file of files) {
                  try {
                    const dataUrl = await compressImage(file);
                    compressedList.push(dataUrl);
                  } catch (err) {
                    console.error("Compression error:", err);
                  }
                }
                setPhotos((prev) => [...prev, ...compressedList]);
                setUploading(false);
                e.target.value = "";
              }}
            />
          </label>
        )}

        <div className="jd-modal-actions">
          {readOnly ? (
            <button type="button" className="jd-primary-btn jd-full" onClick={onClose}>Close view</button>
          ) : (
            <>
              {onDelete && (
                <button type="button" className="jd-danger-btn" onClick={onDelete}><Trash2 size={14} /> Delete</button>
              )}
              <button type="submit" className="jd-primary-btn" disabled={uploading}>{initial ? "Save changes" : "Add task"}</button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

function AddMachinerySectionModal({ onClose, onSave, tasks }) {
  const [assetName, setAssetName] = useState("");
  const [saving, setSaving] = useState(false);

  function submit() {
    const trimmed = assetName.trim();
    if (!trimmed) {
      alert("Please enter a Machinery Section Name.");
      return;
    }
    const exists = tasks.some(
      (t) => t.projectToken === "inventory" && t.project && t.project.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      alert("This Machinery Section already exists!");
      return;
    }
    setSaving(true);
    onSave(trimmed).finally(() => setSaving(false));
  }

  return (
    <div className="jd-modal-overlay" onClick={onClose}>
      <form className="jd-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="jd-modal-head">
          <h3>Add Machinery Section</h3>
          <button type="button" className="jd-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <label className="jd-field-label">Machinery Section Name</label>
        <input
          className="jd-input"
          value={assetName}
          onChange={(e) => setAssetName(e.target.value)}
          placeholder="e.g. Milling Section Machine 1"
          autoFocus
        />

        <div className="jd-modal-actions" style={{ marginTop: "24px" }}>
          <button type="button" className="jd-danger-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="jd-primary-btn" disabled={saving}>
            {saving ? "Adding..." : "Add Machinery Section"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MachineryDirectoryView({ inventoryItemsList, inventoryTasks, session }) {
  const [search, setSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState({});
  const [showAddMachineModal, setShowAddMachineModal] = useState(null);
  const [showAddPartModal, setShowAddPartModal] = useState(null);
  const [customRegistry, setCustomRegistry] = useState(() => {
    try {
      const saved = localStorage.getItem("rmp_custom_machinery_registry");
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const saveRegistry = (next) => {
    setCustomRegistry(next);
    try {
      localStorage.setItem("rmp_custom_machinery_registry", JSON.stringify(next));
    } catch (e) {
      console.error("Error saving machinery registry:", e);
    }
  };

  const handleAddCustomMachine = (section, newMachineName) => {
    const trimmed = newMachineName.trim();
    if (!trimmed) return;
    const next = { ...customRegistry };
    if (!next[section]) next[section] = {};
    if (!next[section][trimmed]) next[section][trimmed] = [];
    saveRegistry(next);
    setShowAddMachineModal(null);
  };

  const handleAddCustomPart = (section, machine, newPartName) => {
    const trimmed = newPartName.trim();
    if (!trimmed) return;
    const next = { ...customRegistry };
    if (!next[section]) next[section] = {};
    if (!next[section][machine]) next[section][machine] = [];
    if (!next[section][machine].includes(trimmed)) {
      next[section][machine] = [...next[section][machine], trimmed];
    }
    saveRegistry(next);
    setShowAddPartModal(null);
  };

  const sectionData = useMemo(() => {
    const sectionMap = {};

    const allSectionsSet = new Set([
      ...inventoryItemsList,
      ...inventoryTasks.map(t => t.project).filter(Boolean)
    ]);

    allSectionsSet.forEach((sectionName) => {
      const defaultMachinery = getSectionDefaultMachinery(sectionName, "inventory") || [];
      const tasksInSection = inventoryTasks.filter(t => t.project && t.project.toLowerCase() === sectionName.toLowerCase() && t.task !== "__init__");
      const taskMachineryNames = tasksInSection.map(t => t.task).filter(Boolean);
      const registryMachinery = Object.keys(customRegistry[sectionName] || {});

      const allMachinerySet = new Set([
        ...defaultMachinery,
        ...taskMachineryNames,
        ...registryMachinery
      ]);

      const machineryList = Array.from(allMachinerySet).map((mName) => {
        const partsFromTasks = tasksInSection
          .filter(t => t.task && t.task.toLowerCase() === mName.toLowerCase())
          .map(t => t.machineryPart || t.machinery_part)
          .filter(Boolean);

        const partsFromRegistry = customRegistry[sectionName]?.[mName] || [];
        const uniqueParts = Array.from(new Set([...partsFromTasks, ...partsFromRegistry]));

        const mTasks = tasksInSection.filter(t => t.task && t.task.toLowerCase() === mName.toLowerCase());
        const totalDownHours = Math.round(mTasks.reduce((sum, t) => sum + (Number(t.daysRequired) || 0), 0) * 100) / 100;

        return {
          name: mName,
          isDefault: defaultMachinery.includes(mName),
          parts: uniqueParts,
          breakdownCount: mTasks.length,
          totalDownHours
        };
      });

      sectionMap[sectionName] = {
        name: sectionName,
        machinery: machineryList,
        totalBreakdowns: tasksInSection.length,
        totalDownHours: Math.round(tasksInSection.reduce((sum, t) => sum + (Number(t.daysRequired) || 0), 0) * 100) / 100
      };
    });

    return sectionMap;
  }, [inventoryItemsList, inventoryTasks, customRegistry]);

  const query = search.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    return Object.values(sectionData).filter((sec) => {
      if (!query) return true;
      if (sec.name.toLowerCase().includes(query)) return true;
      return sec.machinery.some(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.parts.some((p) => p.toLowerCase().includes(query))
      );
    });
  }, [sectionData, query]);

  const totalSections = Object.keys(sectionData).length;
  const totalMachinery = Object.values(sectionData).reduce((acc, sec) => acc + sec.machinery.length, 0);
  const totalParts = Object.values(sectionData).reduce((acc, sec) => acc + sec.machinery.reduce((mAcc, m) => mAcc + m.parts.length, 0), 0);

  const toggleSection = (secName) => {
    setExpandedSections(prev => ({ ...prev, [secName]: !prev[secName] }));
  };

  const expandAll = () => {
    const next = {};
    filteredSections.forEach(s => { next[s.name] = true; });
    setExpandedSections(next);
  };

  const collapseAll = () => {
    setExpandedSections({});
  };

  return (
    <main className="jd-main">
      <div className="jd-stats">
        <StatCard label="Machinery Sections" value={totalSections} />
        <StatCard label="Total Tracked Machines" value={totalMachinery} />
        <StatCard label="Recorded Machinery Parts" value={totalParts} />
      </div>

      <div className="jd-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: "'Oswald', sans-serif", fontSize: "18px", color: "var(--accent)" }}>
              Machinery &amp; Parts Directory
            </h3>
            <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>
              Section-wise breakdown of default and custom machinery details, parts, and maintenance logs.
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              className="jd-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by section, machine, or part..."
              style={{ width: "260px", fontSize: "13px", padding: "6px 12px" }}
            />
            <button type="button" className="jd-input" onClick={expandAll} style={{ cursor: "pointer", padding: "6px 12px", fontSize: "12px" }}>
              Expand All
            </button>
            <button type="button" className="jd-input" onClick={collapseAll} style={{ cursor: "pointer", padding: "6px 12px", fontSize: "12px" }}>
              Collapse All
            </button>
            <button
              type="button"
              className="jd-secondary-btn"
              onClick={() => {
                const rows = [];
                Object.values(sectionData).forEach((sec) => {
                  sec.machinery.forEach((m) => {
                    rows.push({
                      "Section Name": sec.name,
                      "Machinery Name": m.name,
                      "Type": m.isDefault ? "Default" : "Custom",
                      "Machinery Parts List": m.parts.length ? m.parts.join(", ") : "—",
                      "Breakdown Count": m.breakdownCount,
                      "Total Down Hours (hrs)": m.totalDownHours
                    });
                  });
                });
                exportToExcel(rows, "Machinery_and_Parts_Directory_Report", "Machinery Directory");
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "6px 12px", cursor: "pointer" }}
            >
              <Download size={14} /> Export Excel
            </button>
          </div>
        </div>

        {filteredSections.length === 0 ? (
          <p className="jd-empty-note">No machinery sections found matching "{search}".</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {filteredSections.map((sec) => {
              const isExpanded = query ? true : !!expandedSections[sec.name];
              return (
                <div
                  key={sec.name}
                  style={{
                    background: "var(--panel-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    overflow: "hidden"
                  }}
                >
                  <div
                    onClick={() => toggleSection(sec.name)}
                    style={{
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      userSelect: "none",
                      background: "rgba(255,255,255,0.02)"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ color: "var(--accent)", display: "flex", alignItems: "center" }}>
                        {isExpanded ? <Sun size={14} style={{ opacity: 0 }} /> : null}
                        <FolderOpen size={18} style={{ color: "var(--accent)" }} />
                      </span>
                      <strong style={{ fontSize: "15px", color: "var(--text)" }}>{sec.name}</strong>
                      <span
                        style={{
                          fontSize: "11px",
                          background: "var(--panel)",
                          color: "var(--text-dim)",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          border: "1px solid var(--border)"
                        }}
                      >
                        {sec.machinery.length} Machine{sec.machinery.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {sec.totalBreakdowns > 0 && (
                        <span style={{ fontSize: "11.5px", color: "#f59e0b" }}>
                          ⚡ {sec.totalBreakdowns} Breakdowns ({sec.totalDownHours} hrs down)
                        </span>
                      )}
                      {session.role === "management" && (
                        <button
                          type="button"
                          className="jd-primary-btn"
                          style={{ padding: "4px 10px", fontSize: "11.5px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowAddMachineModal(sec.name);
                          }}
                        >
                          <Plus size={12} /> Add Machine
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: "14px 16px", borderTop: "1px solid var(--border)", background: "var(--panel)" }}>
                      {sec.machinery.length === 0 ? (
                        <div style={{ fontSize: "12.5px", color: "var(--text-dim)", fontStyle: "italic" }}>
                          No machines registered for this section yet.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {sec.machinery.map((m) => (
                            <div
                              key={m.name}
                              style={{
                                background: "var(--panel-2)",
                                border: "1px solid var(--border)",
                                borderRadius: "8px",
                                padding: "12px 14px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px"
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <FileText size={15} style={{ color: "var(--accent)" }} />
                                  <strong style={{ fontSize: "13.5px", color: "var(--text)" }}>{m.name}</strong>
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      color: m.isDefault ? "#3da35d" : "#3b82f6",
                                      background: m.isDefault ? "rgba(61,163,93,0.12)" : "rgba(59,130,246,0.12)",
                                      padding: "1px 6px",
                                      borderRadius: "4px",
                                      border: `1px solid ${m.isDefault ? "rgba(61,163,93,0.3)" : "rgba(59,130,246,0.3)"}`
                                    }}
                                  >
                                    {m.isDefault ? "Default" : "Custom"}
                                  </span>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                  {m.breakdownCount > 0 ? (
                                    <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                                      Logs: {m.breakdownCount} breakdown{m.breakdownCount === 1 ? "" : "s"} ({m.totalDownHours} hrs)
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>No breakdowns logged</span>
                                  )}
                                  {session.role === "management" && (
                                    <button
                                      type="button"
                                      className="jd-primary-btn"
                                      style={{ padding: "3px 8px", fontSize: "11px" }}
                                      onClick={() => setShowAddPartModal({ section: sec.name, machine: m.name })}
                                    >
                                      <Plus size={11} /> Add Part
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "2px" }}>
                                <span style={{ fontSize: "11.5px", color: "var(--text-dim)", fontWeight: "600" }}>Parts:</span>
                                {m.parts.length > 0 ? (
                                  m.parts.map((part) => (
                                    <span
                                      key={part}
                                      style={{
                                        fontSize: "11.5px",
                                        background: "var(--panel)",
                                        color: "var(--text)",
                                        padding: "2px 8px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border)"
                                      }}
                                    >
                                      ⚙️ {part}
                                    </span>
                                  ))
                                ) : (
                                  <span style={{ fontSize: "11.5px", color: "var(--text-dim)", fontStyle: "italic" }}>
                                    No machinery parts registered yet
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAddMachineModal && (
        <AddCustomMachineModal
          sectionName={showAddMachineModal}
          onClose={() => setShowAddMachineModal(null)}
          onAdd={(name) => handleAddCustomMachine(showAddMachineModal, name)}
        />
      )}

      {showAddPartModal && (
        <AddCustomPartModal
          sectionName={showAddPartModal.section}
          machineName={showAddPartModal.machine}
          onClose={() => setShowAddPartModal(null)}
          onAdd={(name) => handleAddCustomPart(showAddPartModal.section, showAddPartModal.machine, name)}
        />
      )}
    </main>
  );
}

function AddCustomMachineModal({ sectionName, onClose, onAdd }) {
  const [name, setName] = useState("");
  return (
    <div className="jd-modal-overlay" onClick={onClose}>
      <form className="jd-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onAdd(name); }}>
        <div className="jd-modal-head">
          <h3>Add Machine to {sectionName}</h3>
          <button type="button" className="jd-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="jd-field-label">Machinery Name</label>
        <input
          className="jd-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Main Conveyor Belt Motor"
          autoFocus
        />
        <div className="jd-modal-actions" style={{ marginTop: "24px" }}>
          <button type="button" className="jd-danger-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="jd-primary-btn" disabled={!name.trim()}>Add Machine</button>
        </div>
      </form>
    </div>
  );
}

function AddCustomPartModal({ sectionName, machineName, onClose, onAdd }) {
  const [partName, setPartName] = useState("");
  return (
    <div className="jd-modal-overlay" onClick={onClose}>
      <form className="jd-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onAdd(partName); }}>
        <div className="jd-modal-head">
          <h3>Add Part for {machineName}</h3>
          <button type="button" className="jd-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "12px" }}>
          Section: <strong>{sectionName}</strong>
        </div>
        <label className="jd-field-label">Machinery Part Name</label>
        <input
          className="jd-input"
          value={partName}
          onChange={(e) => setPartName(e.target.value)}
          placeholder="e.g. Gearbox, Bearing, Shaft, Pulley..."
          autoFocus
        />
        <div className="jd-modal-actions" style={{ marginTop: "24px" }}>
          <button type="button" className="jd-danger-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="jd-primary-btn" disabled={!partName.trim()}>Add Part</button>
        </div>
      </form>
    </div>
  );
}

function EditMachinerySectionModal({ initialName, onClose, onSave, tasks }) {
  const [sectionName, setSectionName] = useState(initialName || "");
  const [saving, setSaving] = useState(false);

  function submit() {
    const trimmed = sectionName.trim();
    if (!trimmed) {
      alert("Please enter a Machinery Section Name.");
      return;
    }
    if (trimmed.toLowerCase() === (initialName || "").toLowerCase()) {
      onClose();
      return;
    }
    const exists = tasks.some(
      (t) => t.projectToken === "inventory" && t.project && t.project.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      alert("This Machinery Section already exists!");
      return;
    }
    setSaving(true);
    onSave(initialName, trimmed).finally(() => setSaving(false));
  }

  return (
    <div className="jd-modal-overlay" onClick={onClose}>
      <form className="jd-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="jd-modal-head">
          <h3>Edit Machinery Section Name</h3>
          <button type="button" className="jd-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <label className="jd-field-label">Machinery Section Name</label>
        <input
          className="jd-input"
          value={sectionName}
          onChange={(e) => setSectionName(e.target.value)}
          placeholder="e.g. Milling Section Machine 1"
          autoFocus
        />

        <div className="jd-modal-actions" style={{ marginTop: "24px" }}>
          <button type="button" className="jd-danger-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="jd-primary-btn" disabled={saving}>
            {saving ? "Saving..." : "Save Name"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ProjectFormModal({ onClose, onSave, assigneeNames, userNames, tasks, onPreviewPhoto }) {
  const [selectedNameOption, setSelectedNameOption] = useState(DEFAULT_PROJECT_NAMES[0]);
  const [customNameInput, setCustomNameInput] = useState("");
  const [task, setTask] = useState("");
  const [location, setLocation] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState([]);
  const [noDate, setNoDate] = useState(false);
  const [startDate, setStartDate] = useState(todayStr());
  const [daysRequired, setDaysRequired] = useState("");
  const [endDateOverride, setEndDateOverride] = useState("");
  const [progress, setProgress] = useState(0);
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");

  const computedEnd = endDateOverride || addDays(startDate, daysRequired);

  function submit() {
    const finalName = selectedNameOption === "__custom__" ? customNameInput.trim() : selectedNameOption;
    if (!finalName) {
      alert("Please select or enter a project name.");
      return;
    }
    const exists = tasks.some(
      (t) => t.projectToken !== "maintenance" && t.project && t.project.toLowerCase() === finalName.toLowerCase()
    );
    if (exists) {
      alert("Project already exists! If you want to add a task to it, please select the project and click 'Add Project Task'.");
      return;
    }
    if (!task.trim()) {
      alert("Please enter a Task No.");
      return;
    }

    onSave({
      project: finalName,
      projectToken: "project",
      task: task.trim(),
      location: location.trim(),
      assigneeName: selectedAssignees.join(", "),
      startDate: noDate ? null : startDate,
      daysRequired: noDate ? 0 : (Number(daysRequired) || 0),
      endDateOverride: noDate ? null : (endDateOverride || computedEnd),
      progress: Number(progress),
      photos,
      description
    });
  }

  return (
    <div className="jd-modal-overlay" onClick={onClose}>
      <form className="jd-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="jd-modal-head">
          <h3>Create New Project</h3>
          <button type="button" className="jd-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <label className="jd-field-label">Project Name</label>
        <select
          className="jd-input"
          value={selectedNameOption}
          onChange={(e) => setSelectedNameOption(e.target.value)}
        >
          {DEFAULT_PROJECT_NAMES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
          <option value="__custom__">Custom Name...</option>
        </select>

        {selectedNameOption === "__custom__" && (
          <input
            type="text"
            className="jd-input"
            value={customNameInput}
            onChange={(e) => setCustomNameInput(e.target.value)}
            placeholder="Enter custom project name"
            style={{ marginTop: "8px" }}
            autoFocus
          />
        )}

        <label className="jd-field-label">Task Name </label>
        <input className="jd-input" value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. T-1001" />

        <label className="jd-field-label">Location</label>
        <input className="jd-input" list="jd-proj-locations" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Factory Floor A" />
        <datalist id="jd-proj-locations">{assigneeNames.map((a) => <option key={a} value={a} />)}</datalist>

        <label className="jd-field-label">Assignee</label>
        <AssigneeSelector
          selected={selectedAssignees}
          onChange={setSelectedAssignees}
          readOnly={false}
          defaultAssignees={DEFAULT_PROJECT_ASSIGNEES}
        />

        <label className="jd-field-label">Description</label>
        <textarea
          className="jd-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter task description details..."
          style={{ minHeight: "80px", resize: "vertical" }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "8px 0 16px" }}>
          <input
            type="checkbox"
            id="jd-proj-no-date"
            checked={noDate}
            onChange={(e) => setNoDate(e.target.checked)}
            style={{ accentColor: "var(--accent)", width: "15px", height: "15px", cursor: "pointer" }}
          />
          <label htmlFor="jd-proj-no-date" style={{ fontSize: "13px", color: "var(--text)", cursor: "pointer", userSelect: "none" }}>
            No date for this task
          </label>
        </div>

        <div className="jd-form-row" style={{ opacity: noDate ? 0.5 : 1, pointerEvents: noDate ? "none" : "auto" }}>
          <div>
            <label className="jd-field-label"><Calendar size={12} /> Start date</label>
            <input type="date" className="jd-input" value={noDate ? "" : startDate} onChange={(e) => setStartDate(e.target.value)} disabled={noDate} />
          </div>
          <div>
            <label className="jd-field-label">Days required</label>
            <input type="number" min="0" className="jd-input" value={noDate ? "" : daysRequired} onChange={(e) => { setDaysRequired(e.target.value); setEndDateOverride(""); }} placeholder="e.g. 6" disabled={noDate} />
          </div>
        </div>

        <div style={{ opacity: noDate ? 0.5 : 1, pointerEvents: noDate ? "none" : "auto" }}>
          <label className="jd-field-label">End date {!noDate && daysRequired && !endDateOverride ? "(auto — edit to override)" : ""}</label>
          <input type="date" className="jd-input" value={noDate ? "" : computedEnd} onChange={(e) => setEndDateOverride(e.target.value)} disabled={noDate} />
        </div>

        <label className="jd-field-label">Progress: {progress}%</label>
        <input type="range" min="0" max="100" step="5" value={progress} onChange={(e) => setProgress(e.target.value)} className="jd-slider" />
        <div className="jd-quick-row">
          {[0, 25, 50, 75, 100].map((p) => (
            <button type="button" key={p} className="jd-chip-btn" onClick={() => setProgress(p)}>{p}%</button>
          ))}
        </div>

        <label className="jd-field-label"><Camera size={12} /> Photos ({photos.length})</label>
        {photos.length > 0 && (
          <div className="jd-photo-grid">
            {photos.map((p, idx) => (
              <div
                key={idx}
                className="jd-photo-thumb"
                onClick={() => onPreviewPhoto && onPreviewPhoto({ title: `${task} — Photos`, photos, initialIndex: idx })}
              >
                <img src={p} alt={`Photo ${idx + 1}`} />
                <button
                  type="button"
                  className="jd-photo-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhotos(photos.filter((_, i) => i !== idx));
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <label className="jd-photo-upload-btn">
          <Upload size={14} /> {uploading ? "Compressing & attaching..." : "Upload Photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            disabled={uploading}
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              if (!files.length) return;
              setUploading(true);
              const compressedList = [];
              for (const file of files) {
                try {
                  const dataUrl = await compressImage(file);
                  compressedList.push(dataUrl);
                } catch (err) {
                  console.error("Compression error:", err);
                }
              }
              setPhotos((prev) => [...prev, ...compressedList]);
              setUploading(false);
              e.target.value = "";
            }}
          />
        </label>

        <div className="jd-modal-actions" style={{ marginTop: "24px" }}>
          <button type="button" className="jd-danger-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="jd-primary-btn" disabled={uploading}>Create Project</button>
        </div>
      </form>
    </div>
  );
}

function UserManagementPanel({ users, session, onSaveUsers }) {
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("normal");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function handleRegister(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const name = newUsername.trim();
    const pass = newPassword.trim();
    if (!name || !pass) {
      setError("Please fill in both username and password fields.");
      return;
    }
    const exists = users.some(u => u.username.toLowerCase() === name.toLowerCase());
    if (exists) {
      setError("Username already exists in the system.");
      return;
    }
    const nextUsers = [...users, { username: name, role: newRole, password: pass }];
    onSaveUsers(nextUsers);
    setNewUsername("");
    setNewPassword("");
    setNewRole("normal");
    setSuccess(`User account "${name}" successfully registered!`);
  }

  function handleDelete(username) {
    if (username.toLowerCase() === session.name.toLowerCase()) {
      alert("You cannot delete your own logged-in account!");
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete user account "${username}"?`)) {
      return;
    }
    const nextUsers = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
    onSaveUsers(nextUsers);
  }

  return (
    <main className="jd-main">
      <div className="jd-user-management-grid">
        <div className="jd-panel jd-users-list-card">
          <h4>Registered Users</h4>
          <div className="jd-table-container">
            <table className="jd-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Password</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.username}>
                    <td><strong>{u.username}</strong></td>
                    <td>
                      <span className="jd-status-pill" style={{ "--c": u.role === "management" ? "#f2b705" : u.role === "maintenance" ? "#8b5cf6" : "#6b7280" }}>
                        {u.role === "management" ? "Management" : u.role === "maintenance" ? "Maintenance User" : "Normal User"}
                      </span>
                    </td>
                    <td className="jd-mono">•••••••• (Raw: {u.password})</td>
                    <td>
                      <button
                        type="button"
                        className="jd-danger-btn jd-btn-small"
                        onClick={() => handleDelete(u.username)}
                        disabled={u.username.toLowerCase() === session.name.toLowerCase()}
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form className="jd-panel jd-user-register-card" onSubmit={handleRegister}>
          <h4>Register New User</h4>

          <label className="jd-field-label">Username</label>
          <input
            type="text"
            className="jd-input"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="e.g. Ruwan"
          />

          <label className="jd-field-label">Password</label>
          <input
            type="password"
            className="jd-input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Set password"
          />

          <label className="jd-field-label">Role</label>
          <select className="jd-input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="normal">Normal User (View-only)</option>
            <option value="maintenance">Maintenance User (Maintenance tasks only)</option>
            <option value="management">Management User (Full-access)</option>
          </select>

          {error && <div style={{ color: "#ff6b6b", fontSize: "12.5px", marginTop: "10px" }}>{error}</div>}
          {success && <div style={{ color: "#3da35d", fontSize: "12.5px", marginTop: "10px" }}>{success}</div>}

          <button type="submit" className="jd-primary-btn jd-full" style={{ marginTop: "18px" }}>
            <UserPlus size={14} /> Register User
          </button>
        </form>
      </div>
    </main>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap');

:root {
  --bg: #15171B;
  --panel: #1E2126;
  --panel-2: #262A31;
  --border: #343941;
  --text: #ECEAE5;
  --text-dim: #9BA1AA;
  --accent: #F26430;
  color-scheme: dark;
}

:root.light-mode {
  --bg: #F5F7FA;
  --panel: #FFFFFF;
  --panel-2: #E8ECF2;
  --border: #CFD6E0;
  --text: #171A1F;
  --text-dim: #606875;
  --accent: #F26430;
  color-scheme: light;
}

html, body {
  margin: 0;
  padding: 0;
  background-color: var(--bg);
  transition: background-color 0.2s;
}

.jd-app {
  font-family:'Inter', sans-serif; background:var(--bg); color:var(--text); min-height:100vh; width:100%; box-sizing:border-box;
  transition: background-color 0.2s, color 0.2s;
}
.jd-app * { box-sizing:border-box; }
.jd-loading { display:flex; align-items:center; justify-content:center; height:100vh; color:var(--text-dim); font-family:'JetBrains Mono', monospace; }

.jd-sticky-header { position:sticky; top:0; z-index:100; background:var(--bg); border-bottom:1px solid var(--border); box-shadow:0 4px 12px rgba(0,0,0,0.15); }
.jd-header { display:flex; align-items:center; justify-content:space-between; padding:14px 22px; border-bottom:1px solid var(--border); background:var(--panel); }
.jd-brand { display:flex; align-items:center; gap:12px; color:var(--accent); }
.jd-header-logo { height: 32px; border-radius: 4px; object-fit: contain; }
.jd-login-logo { height: 60px; border-radius: 8px; object-fit: contain; margin-bottom: 4px; }
.jd-login-brand-col { display: flex; flex-direction: column; align-items: center; gap: 10px; color: var(--accent); justify-content: center; margin-bottom: 14px; }
.jd-brand-title { font-family:'Oswald', sans-serif; font-size:16px; font-weight:700; letter-spacing:0.06em; color:var(--text); }
.jd-brand-sub { font-size:11px; color:var(--text-dim); margin-top:2px; }
.jd-user { display:flex; align-items:center; gap:12px; }
.jd-user-name { display:flex; align-items:center; gap:6px; font-size:13px; color:var(--text-dim); }
.jd-icon-btn { background:transparent; border:1px solid var(--border); color:var(--text-dim); border-radius:6px; padding:6px; cursor:pointer; display:flex; }
.jd-icon-btn:hover { color:var(--text); border-color:var(--text-dim); }
.jd-error-bar { background:#3a1f1f; color:#f2a3a3; font-size:13px; padding:8px 22px; border-bottom:1px solid #5c2b2b; }

.jd-tabs { display:flex; align-items:center; gap:8px; padding:10px 22px; border-bottom:1px solid var(--border); background:var(--bg); overflow-x:auto; }
.jd-tabs button { display:flex; align-items:center; gap:6px; background:transparent; border:1px solid var(--border); color:var(--text-dim); padding:7px 13px; border-radius:7px; cursor:pointer; font-size:13px; white-space:nowrap; }
.jd-tabs button.active { background:var(--panel-2); color:var(--text); border-color:var(--text-dim); }
.jd-tabs-add { margin-left:auto; }
.jd-hamburger { display: none; }
.jd-mobile-menu-overlay { display: none; }

.jd-primary-btn { display:flex; align-items:center; gap:6px; background:var(--accent); color:#191008; border:none; font-weight:600; font-size:13.5px; padding:9px 16px; border-radius:8px; cursor:pointer; white-space:nowrap; }
.jd-primary-btn:hover { background:#ff7940; }
.jd-primary-btn:disabled { background:var(--panel-2); color:var(--text-dim); cursor:not-allowed; }
.jd-danger-btn { display:flex; align-items:center; gap:6px; background:transparent; border:1px solid #5c2b2b; color:#f2a3a3; padding:9px 14px; border-radius:8px; cursor:pointer; font-size:13px; }
.jd-full { width:100%; justify-content:center; }

.jd-main { padding:20px 22px 40px; display:flex; flex-direction:column; gap:18px; }
.jd-stats { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; }
.jd-stat { background:var(--panel); border:1px solid var(--accent); border-radius:10px; padding:14px; text-align:center; }
.jd-stat-value { font-family:'Oswald', sans-serif; font-size:26px; font-weight:600; color:var(--accent); }
.jd-stat-label { font-size:10.5px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-top:2px; }

.jd-charts { display: flex; flex-wrap: wrap; gap: 14px; }
.jd-charts > .jd-panel { flex: 1 1 280px; min-width: 280px; }
.jd-charts > .jd-panel-wide { flex: 2 1 400px; min-width: 320px; }
.jd-panel { background:var(--panel); border:1px solid var(--accent); border-radius:10px; padding:16px; max-width:100%; box-sizing:border-box; }
.jd-panel h4 { display:flex; align-items:center; gap:6px; font-family:'Oswald', sans-serif; font-size:14px; font-weight:600; margin:0 0 10px; color:var(--accent); }
.jd-panel-wide { min-width:0; }
.jd-empty-note { color:var(--text-dim); font-size:13px; }

.jd-two-col { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.jd-table { width:100%; border-collapse:separate; border-spacing:0; font-size:13px; }
.jd-table th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-dim); padding:10px 10px; border-bottom:1px solid var(--border); position:sticky; top:0; background:var(--panel); z-index:10; box-shadow:0 1px 0 var(--border); }
.jd-table-divided th:not(:first-child) { border-left:1px solid var(--border); padding-left:12px; }
.jd-table-container, .jd-table-wrap { overflow:auto; max-height:calc(100vh - 240px); border:1px solid var(--border); border-radius:8px; background:var(--panel); }
.jd-table-container::-webkit-scrollbar { width:6px; height:6px; }
.jd-table-container::-webkit-scrollbar-track { background:transparent; }
.jd-table-container::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }
.jd-table-container::-webkit-scrollbar-thumb:hover { background:var(--text-dim); }
.jd-table td { padding:8px; border-bottom:1px solid var(--border); }
.jd-table-click tr { cursor:pointer; }
.jd-table-click tr:hover { background:var(--panel-2); }
.jd-row-overdue td:first-child { box-shadow:inset 3px 0 0 #E5484D; }
.jd-mono { font-family:'JetBrains Mono', monospace; font-size:12px; color:var(--text-dim); }

.jd-progress-wrap { display:flex; align-items:center; gap:8px; min-width:100px; }
.jd-progress-track { flex:1; height:6px; background:var(--panel-2); border-radius:4px; overflow:hidden; }
.jd-progress-fill { height:100%; border-radius:4px; }
.jd-progress-label { font-size:11px; color:var(--text-dim); width:32px; }

.jd-status-pill { font-size:10.5px; font-weight:600; text-transform:uppercase; padding:3px 8px; border-radius:4px; color:var(--c); background:color-mix(in srgb, var(--c) 16%, transparent); border:1px solid color-mix(in srgb, var(--c) 45%, transparent); }

.jd-filters { display:flex; gap:10px; }
.jd-input, select.jd-input { width:100%; background:var(--panel-2); border:1px solid var(--border); color:var(--text); border-radius:7px; padding:9px 10px; font-size:13.5px; font-family:inherit; outline:none; }
.jd-input:focus { border-color:var(--accent); }

.jd-modal-overlay { position:fixed; inset:0; background:rgba(10,11,13,0.72); display:flex; align-items:center; justify-content:center; padding:20px; z-index:2000; }
.jd-modal { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:22px; width:100%; max-width:440px; max-height:88vh; overflow-y:auto; position:relative; z-index:2001; }
.jd-modal-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:8px; }
.jd-modal-head h3 { font-family:'Oswald', sans-serif; font-size:17px; margin:0; font-weight:600; }
.jd-field-label { display:flex; align-items:center; gap:5px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-dim); margin:12px 0 5px; }
.jd-form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.jd-slider { width:100%; accent-color:var(--accent); }
.jd-quick-row { display:flex; gap:6px; margin-top:8px; }
.jd-chip-btn { flex:1; background:var(--panel-2); border:1px solid var(--border); color:var(--text-dim); border-radius:6px; padding:6px 0; cursor:pointer; font-size:12px; }
.jd-chip-btn:hover { color:var(--text); border-color:var(--accent); }
.jd-modal-actions { display:flex; justify-content:space-between; align-items:center; margin-top:18px; gap:10px; }

.jd-assignee-selector { display: flex; flex-direction: column; gap: 10px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
.jd-assignee-chips { display: flex; flex-wrap: wrap; gap: 6px; min-height: 32px; align-items: center; }
.jd-assignee-chip { display: flex; align-items: center; gap: 6px; background: var(--accent); color: #191008; font-weight: 600; font-size: 11.5px; padding: 4px 8px; border-radius: 6px; }
.jd-assignee-chip-remove { background: none; border: none; color: #191008; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
.jd-assignee-empty { font-size: 12px; color: var(--text-dim); font-style: italic; }
.jd-assignee-list { display: flex; flex-direction: column; gap: 6px; max-height: 150px; overflow-y: auto; border: 1px solid var(--border); border-radius: 6px; padding: 8px; background: var(--panel); }
.jd-assignee-list-item { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12.5px; color: var(--text-dim); padding: 4px; user-select: none; }
.jd-assignee-list-item:hover { color: var(--text); }
.jd-assignee-list-item input[type="checkbox"] { accent-color: var(--accent); width: 14px; height: 14px; cursor: pointer; margin: 0; }

.jd-projects-layout { display: grid; grid-template-columns: 260px 1fr; gap: 20px; align-items: start; }
.jd-project-btn { width: 100%; text-align: left; padding: 10px 12px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s ease; margin-bottom: 2px; }
.jd-project-btn:hover { border-color: var(--text-dim); }
.jd-project-btn.active { background: var(--accent); color: #191008; border-color: var(--accent); font-weight: 600; }
.jd-login-screen { display:flex; align-items:center; justify-content:center; min-height:100vh; background-size:cover; background-position:center; background-repeat:no-repeat; padding:20px; position:relative; }
.jd-login-screen::before { content:""; position:absolute; inset:0; background:rgba(0, 0, 0, 0.15); z-index:1; }
.jd-login-card { background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:28px; width:100%; max-width:380px; box-shadow:0 15px 35px rgba(0,0,0,0.6); z-index:2; }
.jd-login-brand { justify-content:center; margin-bottom:14px; }
.jd-login-copy { font-size:13px; color:var(--text-dim); line-height:1.5; margin:0 0 6px; }
.jd-login-tabs { display:flex; gap:8px; margin:16px 0; }
.jd-login-tabs button { flex:1; background:var(--panel-2); border:1px solid var(--border); color:var(--text-dim); border-radius:6px; padding:8px 0; cursor:pointer; font-size:12px; font-weight:500; }
.jd-login-tabs button.active { background:var(--accent); color:#191008; border-color:var(--accent); font-weight:600; }

.jd-user-management-grid { display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start; }
.jd-users-list-card { flex:2; min-width:320px; }
.jd-user-register-card { flex:1; min-width:280px; }
.jd-link-btn { background:none; border:none; color:var(--accent); cursor:pointer; font-size:12.5px; text-decoration:underline; font-family:inherit; padding:0; }
.jd-link-btn:hover { color:#fff; }

.jd-photo-grid { display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; }
.jd-photo-thumb { position:relative; width:64px; height:64px; border-radius:6px; overflow:hidden; border:1px solid var(--border); cursor:pointer; background:var(--panel-2); }
.jd-photo-thumb img { width:100%; height:100%; object-fit:cover; }
.jd-photo-remove { position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.75); border:none; color:#ff6b6b; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0; }
.jd-photo-upload-btn { display:flex; align-items:center; justify-content:center; gap:6px; border:1px dashed var(--border); background:var(--panel-2); color:var(--text-dim); border-radius:7px; padding:10px; cursor:pointer; font-size:12.5px; font-weight:500; margin-top:8px; transition:border-color 0.2s; }
.jd-photo-upload-btn:hover { border-color:var(--accent); color:var(--text); }
.jd-lightbox-overlay { position:fixed; inset:0; background:rgba(10,11,13,0.95); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; z-index:9999; backdrop-filter:blur(6px); }
.jd-lightbox-content { position:relative; max-width:90vw; max-height:75vh; display:flex; align-items:center; justify-content:center; }
.jd-lightbox-img { max-width:100%; max-height:75vh; border-radius:8px; object-fit:contain; box-shadow:0 12px 36px rgba(0,0,0,0.8); }
.jd-lightbox-bar { display:flex; gap:8px; margin-top:16px; overflow-x:auto; max-width:90vw; padding:4px; }
.jd-lightbox-thumb { width:52px; height:52px; border-radius:6px; object-fit:cover; cursor:pointer; border:2px solid transparent; opacity:0.6; transition:all 0.2s; }
.jd-lightbox-thumb.active { border-color:var(--accent); opacity:1; }

@media (max-width: 768px) {
  .jd-tabs { display: none !important; }
  .jd-hamburger { display: flex; }
  .jd-logout-btn { display: none !important; }
  .jd-user-name { display: none !important; }
  .jd-mobile-menu-overlay { display: block; position: fixed; inset: 0; top: 57px; background: rgba(10, 11, 13, 0.72); z-index: 45; }
  .jd-mobile-menu { background: var(--panel); border-bottom: 1px solid var(--border); padding: 14px 20px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .jd-mobile-menu button { display: flex; align-items: center; gap: 8px; background: var(--panel-2); border: 1px solid var(--border); color: var(--text-dim); padding: 10px 14px; border-radius: 8px; cursor: pointer; text-align: left; font-size: 14px; font-weight: 500; width: 100%; }
  .jd-mobile-menu button.active { background: var(--accent); color: #191008; border-color: var(--accent); font-weight: 600; }
  .jd-mobile-menu-logout { border-color: #5c2b2b !important; color: #f2a3a3 !important; }

  .jd-projects-layout { grid-template-columns: 1fr; }
  .jd-inventory-header-grid { grid-template-columns: 1fr !important; }
  .jd-user-management-grid { flex-direction: column; }
  .jd-panel { padding: 14px 10px; box-sizing: border-box; width: 100%; max-width: 100%; }
  .jd-panel-wide { grid-column: span 1 !important; }
  .jd-stats { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .jd-charts { flex-direction: column; gap: 14px; }
  .jd-two-col { grid-template-columns: 1fr; }
  .jd-header { padding: 12px 14px; flex-direction: row; gap: 10px; align-items: center; justify-content: space-between; }
  .jd-user { justify-content: flex-end; }
  .jd-main { padding: 14px 10px 30px; gap: 14px; max-width: 100vw; }
  .jd-filters { flex-direction: column; gap: 8px; }
}

@media (max-width: 480px) {
  .jd-stats { grid-template-columns: repeat(2, 1fr); }
  .jd-panel { padding: 12px 8px; }
}
`;
