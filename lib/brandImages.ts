// Brand name → website domain for Clearbit logo lookup
// Unmapped brands fall back to the generic watch SVG in BrandImage component

const BRAND_DOMAINS: Record<string, string> = {
  // CASIO family
  'CASIO':                       'casio.com',
  'G-SHOCK':                     'g-shock.com',
  'G SHOCK':                     'g-shock.com',
  'BABY-G':                      'casio.com',
  'BABY G':                      'casio.com',
  'EDIFICE':                     'casio.com',
  'PRO TREK':                    'casio.com',

  // SEIKO family
  'SEIKO':                       'seiko.com',
  'ALBA':                        'seiko.com',
  'SEIKO WALL CLOCK':            'seiko.com',
  'SEIKO ALARM CLOCK':           'seiko.com',
  'SEIKO SPORT 5':               'seiko.com',
  'SEIKO SPORTS 5':              'seiko.com',
  'SEIKO 5-GENTS(PROMOTION)':   'seiko.com',

  // Swatch Group / Swiss
  'TISSOT':                      'tissot.com',
  'LONGINES':                    'longines.com',
  'RADO':                        'rado.com',
  'MIDO':                        'midowatches.com',
  'HAMILTON':                    'hamiltonwatch.com',
  'OMEGA':                       'omegawatches.com',
  'TAG HEUER':                   'tagheuer.com',
  'BREITLING':                   'breitling.com',
  'IWC':                         'iwc.com',
  'ROLEX':                       'rolex.com',

  // CITIZEN family
  'CITIZEN':                     'citizenwatch.com',
  'Q&Q WATCH':                   'qandqsmile.com',

  // US / European fashion
  'FOSSIL':                      'fossil.com',
  'GUESS':                       'guess.com',
  'TIMBERLAND':                  'timberland.com',
  'SKECHERS':                    'skechers.com',
  'REEBOK':                      'reebok.com',
  'POLICE':                      'policelifestyle.com',
  'CHARLES JOURDAN':             'charlesjourdan.com',
  'CERRUTI':                     'cerruti1881.com',
  'ALAIN DELON':                 'alaindelon.com',
  'CALVIN KLEIN':                'calvinklein.com',
  'DKNY':                        'dkny.com',
  'EMPORIO ARMANI':              'armani.com',
  'MICHAEL KORS':                'michaelkors.com',
  'HUGO BOSS':                   'hugoboss.com',
  'TOMMY HILFIGER':              'tommy.com',

  // Asian brands with web presence
  'BONIA':                       'boniawatches.com',
  'NAVI FORCE':                  'naviforce.com',
  'DANIEL KLEIN':                'danielklein.com',
  'ALEXANDRE CHRISTIE':          'alexandrechristie.com',
  'CROCODILE WALL CLOCK':        'crocodile.com.sg',
  'CROCODILE ALARM CLOCK':       'crocodile.com.sg',
  'J.BOVIER':                    'jbovier.com',
};

export function getBrandImageUrl(brand: string): string | null {
  const key = brand.trim().toUpperCase();
  // Try exact match first
  if (BRAND_DOMAINS[key]) {
    return `https://logo.clearbit.com/${BRAND_DOMAINS[key]}`;
  }
  // Try partial match for variants like "SEIKO 5-GENTS(PROMOTION)"
  for (const [mapKey, domain] of Object.entries(BRAND_DOMAINS)) {
    if (key.startsWith(mapKey) || mapKey.startsWith(key)) {
      return `https://logo.clearbit.com/${domain}`;
    }
  }
  return null;
}
