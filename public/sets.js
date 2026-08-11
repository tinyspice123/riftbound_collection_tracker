// Riftbound set registry. Each entry has its own tracker URL through
// tracker.html?set=<id>. The shared published Google Sheets URL is combined
// with each tab's gid below; local CSVs remain available as offline fallbacks.
const SHEET_BASE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSm8AkNo1rDeKzh2VSeGOT5lbFBSQNl13zAAli3TPQvd1J060fboLL5oh-mEQrASAjt54Qzi8D1KSPD/pub";

const SETS = {
  origins: {
    name: "Origins",
    code: "OGN",
    homeGroup: "core",
    subtitle: "Set 1 collection checklist",
    sheetGid: "2004298133",
  },
  spiritforged: {
    name: "Spiritforged",
    code: "SFD",
    homeGroup: "core",
    subtitle: "Set 2 collection checklist",
    sheetGid: "814762207",
  },
  unleashed: {
    name: "Unleashed",
    code: "UNL",
    homeGroup: "core",
    subtitle: "Set 3 collection checklist",
    sheetGid: "492361622",
  },
  vendetta: {
    name: "Vendetta",
    code: "VEN",
    homeGroup: "core",
    subtitle: "Set 4 collection checklist",
    sheetGid: "687086449",
  },
};

for(const cfg of Object.values(SETS)){
  if(SHEET_BASE_URL && cfg.sheetGid){
    cfg.sheet=`${SHEET_BASE_URL}?gid=${encodeURIComponent(cfg.sheetGid)}&single=true&output=csv`;
  }
}
