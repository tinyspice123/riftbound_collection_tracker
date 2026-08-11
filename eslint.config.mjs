import js from '@eslint/js';

const browserGlobals={
  Blob:'readonly', URL:'readonly', URLSearchParams:'readonly', document:'readonly',
  fetch:'readonly',
  history:'readonly', localStorage:'readonly', location:'readonly', navigator:'readonly',
  setInterval:'readonly', setTimeout:'readonly', clearTimeout:'readonly', window:'readonly',
  Event:'readonly', IntersectionObserver:'readonly', Map:'readonly', Set:'readonly',
  Object:'readonly', Date:'readonly', console:'readonly', Response:'readonly',
  SETS:'readonly', csvToRows:'readonly', rowsToItems:'readonly', esc:'readonly',
  detectColumns:'readonly',
  setSafeImageSource:'readonly', imgCandidatesPure:'readonly', manifestKey:'readonly',
  sortItems:'readonly', marketplaceSearchUrls:'readonly', priceMid:'readonly',
  matchesQuery:'readonly', exportText:'readonly', exportCsv:'readonly',
  parseHaveQty:'readonly',
};

export default [
  {ignores:['public/sets.js','public/img/**']},
  {
    files:['public/index.js','public/tracker.js','public/pwa.js'],
    ...js.configs.recommended,
    languageOptions:{ecmaVersion:'latest',sourceType:'script',globals:browserGlobals},
    rules:{...js.configs.recommended.rules,'no-unused-vars':'off'},
  },
  {
    files:['public/lib.js'],
    ...js.configs.recommended,
    languageOptions:{ecmaVersion:'latest',sourceType:'script',globals:{module:'readonly',URL:'readonly'}},
    rules:{...js.configs.recommended.rules,'no-unused-vars':'off'},
  },
  {
    files:['public/sw.js'],
    ...js.configs.recommended,
    languageOptions:{ecmaVersion:'latest',sourceType:'script',globals:{
      caches:'readonly',console:'readonly',fetch:'readonly',location:'readonly',
      Promise:'readonly',Response:'readonly',self:'readonly',URL:'readonly',
    }},
    rules:{...js.configs.recommended.rules,'no-unused-vars':'off'},
  },
];
