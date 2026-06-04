// 48 teams split across 3 tiers of 16.
// IDs match football-data.org team IDs.

const TEAMS = {
  tier1: [
    { id: 762,  name: 'Argentina',     tla: 'ARG', flag: '🇦🇷' },
    { id: 773,  name: 'France',        tla: 'FRA', flag: '🇫🇷' },
    { id: 764,  name: 'Brazil',        tla: 'BRA', flag: '🇧🇷' },
    { id: 770,  name: 'England',       tla: 'ENG', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { id: 760,  name: 'Spain',         tla: 'ESP', flag: '🇪🇸' },
    { id: 759,  name: 'Germany',       tla: 'GER', flag: '🇩🇪' },
    { id: 765,  name: 'Portugal',      tla: 'POR', flag: '🇵🇹' },
    { id: 8601, name: 'Netherlands',   tla: 'NED', flag: '🇳🇱' },
    { id: 805,  name: 'Belgium',       tla: 'BEL', flag: '🇧🇪' },
    { id: 799,  name: 'Croatia',       tla: 'CRO', flag: '🇭🇷' },
    { id: 758,  name: 'Uruguay',       tla: 'URY', flag: '🇺🇾' },
    { id: 815,  name: 'Morocco',       tla: 'MAR', flag: '🇲🇦' },
    { id: 771,  name: 'United States', tla: 'USA', flag: '🇺🇸' },
    { id: 769,  name: 'Mexico',        tla: 'MEX', flag: '🇲🇽' },
    { id: 804,  name: 'Senegal',       tla: 'SEN', flag: '🇸🇳' },
    { id: 818,  name: 'Colombia',      tla: 'COL', flag: '🇨🇴' },
  ],
  tier2: [
    { id: 788,  name: 'Switzerland',   tla: 'SUI', flag: '🇨🇭' },
    { id: 766,  name: 'Japan',         tla: 'JPN', flag: '🇯🇵' },
    { id: 772,  name: 'South Korea',   tla: 'KOR', flag: '🇰🇷' },
    { id: 779,  name: 'Australia',     tla: 'AUS', flag: '🇦🇺' },
    { id: 816,  name: 'Austria',       tla: 'AUT', flag: '🇦🇹' },
    { id: 792,  name: 'Sweden',        tla: 'SWE', flag: '🇸🇪' },
    { id: 798,  name: 'Czechia',       tla: 'CZE', flag: '🇨🇿' },
    { id: 828,  name: 'Canada',        tla: 'CAN', flag: '🇨🇦' },
    { id: 791,  name: 'Ecuador',       tla: 'ECU', flag: '🇪🇨' },
    { id: 803,  name: 'Turkey',        tla: 'TUR', flag: '🇹🇷' },
    { id: 8872, name: 'Norway',        tla: 'NOR', flag: '🇳🇴' },
    { id: 8873, name: 'Scotland',      tla: 'SCO', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
    { id: 778,  name: 'Algeria',       tla: 'ALG', flag: '🇩🇿' },
    { id: 825,  name: 'Egypt',         tla: 'EGY', flag: '🇪🇬' },
    { id: 802,  name: 'Tunisia',       tla: 'TUN', flag: '🇹🇳' },
    { id: 840,  name: 'Iran',          tla: 'IRN', flag: '🇮🇷' },
  ],
  tier3: [
    { id: 774,  name: 'South Africa',      tla: 'RSA', flag: '🇿🇦' },
    { id: 801,  name: 'Saudi Arabia',      tla: 'KSA', flag: '🇸🇦' },
    { id: 761,  name: 'Paraguay',          tla: 'PAR', flag: '🇵🇾' },
    { id: 763,  name: 'Ghana',             tla: 'GHA', flag: '🇬🇭' },
    { id: 783,  name: 'New Zealand',       tla: 'NZL', flag: '🇳🇿' },
    { id: 1060, name: 'Bosnia-Herz.',      tla: 'BIH', flag: '🇧🇦' },
    { id: 1836, name: 'Panama',            tla: 'PAN', flag: '🇵🇦' },
    { id: 836,  name: 'Haiti',             tla: 'HAI', flag: '🇭🇹' },
    { id: 8049, name: 'Jordan',            tla: 'JOR', flag: '🇯🇴' },
    { id: 8062, name: 'Iraq',              tla: 'IRQ', flag: '🇮🇶' },
    { id: 8070, name: 'Uzbekistan',        tla: 'UZB', flag: '🇺🇿' },
    { id: 1930, name: 'Cape Verde',        tla: 'CPV', flag: '🇨🇻' },
    { id: 1934, name: 'Congo DR',          tla: 'COD', flag: '🇨🇩' },
    { id: 1935, name: 'Ivory Coast',       tla: 'CIV', flag: '🇨🇮' },
    { id: 8030, name: 'Qatar',             tla: 'QAT', flag: '🇶🇦' },
    { id: 9460, name: 'Curaçao',           tla: 'CUW', flag: '🇨🇼' },
  ],
};

// Flat lookup: teamId → team object with tier
const ALL_TEAMS = {};
[1, 2, 3].forEach(tier => {
  TEAMS[`tier${tier}`].forEach(t => {
    ALL_TEAMS[t.id] = { ...t, tier };
  });
});

function getTeam(id) {
  return ALL_TEAMS[id] || null;
}

function getTierTeams(tier) {
  return TEAMS[`tier${tier}`];
}

function getTeamCrestUrl(id) {
  return `https://crests.football-data.org/${id}.svg`;
}
