/**
 * Audited starter catalog; NOT a national university directory.
 * Ministry of Education 985 list (39): https://www.moe.gov.cn/srcsite/A22/s7065/200612/t20061206_128833.html
 * C9 nine members: https://cge.bit.edu.cn/sjxx/yjsjyjcpt/ynxx/b150573.htm
 * Keep static facts compact in WeChat subpackage. No personal data, no API memory.
 * More universities must come through separately sourced, reviewed datasets.
 */
export const MOE_985_SOURCE = "https://www.moe.gov.cn/srcsite/A22/s7065/200612/t20061206_128833.html"
export const C9_SOURCE = "https://cge.bit.edu.cn/sjxx/yjsjyjcpt/ynxx/b150573.htm"
export const MOE_211_SOURCE = "https://www.moe.gov.cn/srcsite/A22/s7065/200512/t20051223_82762.html"
export const REGIONAL_211_CROSSCHECK = "https://www.gk100.com/read_75189251.htm"
export type School = {
  id: string
  name: string
  province: string
  city: string
  keywords: string
  isC9: boolean
  is985: boolean
  is211: boolean
  campusRecord: boolean
  sourceUrl: string
  website: string
  intro: string
  introSource: string
  address: string
  addressSource: string
  founded: string
  verifiedStats?: {
    campusCount: number
    collegeCount: number
    doubleFirstSubjects: number
    sourceUrl: string
    sourceChecked: string
  }
  admissions?: {
    title: string
    url: string
    catalogsTitle: string
    catalogsUrl: string
    summerTitle: string
    summerUrl: string
  }
}

const tuples: ReadonlyArray<readonly [string,string,string,string]> = [
  [
    "北京大学",
    "北京",
    "北京",
    "beijingdaxue pku"
  ],
  [
    "中国人民大学",
    "北京",
    "北京",
    "zhongguorenmindaxue ruc"
  ],
  [
    "清华大学",
    "北京",
    "北京",
    "qinghuadaxue thu"
  ],
  [
    "北京航空航天大学",
    "北京",
    "北京",
    "beijinghangkonghangtiandaxue buaa"
  ],
  [
    "北京理工大学",
    "北京",
    "北京",
    "beijingligongdaxue bit"
  ],
  [
    "中国农业大学",
    "北京",
    "北京",
    "zhongguonongyedaxue cau"
  ],
  [
    "北京师范大学",
    "北京",
    "北京",
    "beijingshifandaxue bnu"
  ],
  [
    "中央民族大学",
    "北京",
    "北京",
    "zhongyangminzudaxue muc"
  ],
  [
    "南开大学",
    "天津",
    "天津",
    "nankaidaxue nku"
  ],
  [
    "天津大学",
    "天津",
    "天津",
    "tianjindaxue tju"
  ],
  [
    "大连理工大学",
    "辽宁",
    "大连",
    "dalianligongdaxue dlut"
  ],
  [
    "东北大学",
    "辽宁",
    "沈阳",
    "dongbeidaxue neu"
  ],
  [
    "吉林大学",
    "吉林",
    "长春",
    "jilindaxue jlu"
  ],
  [
    "哈尔滨工业大学",
    "黑龙江",
    "哈尔滨",
    "haerbingongyedaxue hit"
  ],
  [
    "复旦大学",
    "上海",
    "上海",
    "fudandaxue fdu"
  ],
  [
    "同济大学",
    "上海",
    "上海",
    "tongjidaxue tju"
  ],
  [
    "上海交通大学",
    "上海",
    "上海",
    "shanghaijiaotongdaxue sjtu"
  ],
  [
    "华东师范大学",
    "上海",
    "上海",
    "huadongshifandaxue ecnu"
  ],
  [
    "南京大学",
    "江苏",
    "南京",
    "nanjingdaxue nju"
  ],
  [
    "东南大学",
    "江苏",
    "南京",
    "dongnandaxue seu"
  ],
  [
    "浙江大学",
    "浙江",
    "杭州",
    "zhejiangdaxue zju"
  ],
  [
    "中国科学技术大学",
    "安徽",
    "合肥",
    "zhongguokexuejishudaxue ustc"
  ],
  [
    "厦门大学",
    "福建",
    "厦门",
    "xiamendaxue xmu"
  ],
  [
    "山东大学",
    "山东",
    "济南",
    "shandongdaxue sdu"
  ],
  [
    "中国海洋大学",
    "山东",
    "青岛",
    "zhongguohaiyangdaxue ouc"
  ],
  [
    "武汉大学",
    "湖北",
    "武汉",
    "wuhandaxue whu"
  ],
  [
    "华中科技大学",
    "湖北",
    "武汉",
    "huazhongkejidaxue hust"
  ],
  [
    "湖南大学",
    "湖南",
    "长沙",
    "hunandaxue hnu"
  ],
  [
    "中南大学",
    "湖南",
    "长沙",
    "zhongnandaxue csu"
  ],
  [
    "国防科技大学",
    "湖南",
    "长沙",
    "guofangkejidaxue nudt"
  ],
  [
    "中山大学",
    "广东",
    "广州",
    "zhongshandaxue sysu"
  ],
  [
    "华南理工大学",
    "广东",
    "广州",
    "huananligongdaxue scut"
  ],
  [
    "四川大学",
    "四川",
    "成都",
    "sichuandaxue scu"
  ],
  [
    "电子科技大学",
    "四川",
    "成都",
    "dianzikejidaxue uestc"
  ],
  [
    "重庆大学",
    "重庆",
    "重庆",
    "chongqingdaxue cqu"
  ],
  [
    "西安交通大学",
    "陕西",
    "西安",
    "xianjiaotongdaxue xjtu"
  ],
  [
    "西北工业大学",
    "陕西",
    "西安",
    "xibeigongyedaxue nwpu"
  ],
  [
    "西北农林科技大学",
    "陕西",
    "咸阳",
    "xibeinonglinkejidaxue nwafu"
  ],
  [
    "兰州大学",
    "甘肃",
    "兰州",
    "lanzhoudaxue lzu"
  ]
]
// 77 non-985 211 entries, including 华北电力大学保定 as a distinct campus entry.
// Original MoE 211 source is authoritative for project membership; 116 is the
// common school/campus listing convention, not 116 distinct legal entities.
// Army medical schools have modern display names (historical aliases below).
const other211: ReadonlyArray<readonly [string,string,string]> = [["北京科技大学","北京","北京"],["北京交通大学","北京","北京"],["中央财经大学","北京","北京"],["北京邮电大学","北京","北京"],["中国政法大学","北京","北京"],["北京化工大学","北京","北京"],["对外经济贸易大学","北京","北京"],["中国石油大学（北京）","北京","北京"],["北京中医药大学","北京","北京"],["北京工业大学","北京","北京"],["中国地质大学（北京）","北京","北京"],["中国矿业大学（北京）","北京","北京"],["北京外国语大学","北京","北京"],["中国传媒大学","北京","北京"],["北京林业大学","北京","北京"],["华北电力大学","北京","北京"],["北京体育大学","北京","北京"],["中央音乐学院","北京","北京"],["天津医科大学","天津","天津"],["河北工业大学","河北","天津"],["华北电力大学（保定）","河北","保定"],["太原理工大学","山西","太原"],["内蒙古大学","内蒙古","呼和浩特"],["大连海事大学","辽宁","大连"],["辽宁大学","辽宁","沈阳"],["东北师范大学","吉林","长春"],["延边大学","吉林","延吉"],["哈尔滨工程大学","黑龙江","哈尔滨"],["东北林业大学","黑龙江","哈尔滨"],["东北农业大学","黑龙江","哈尔滨"],["上海财经大学","上海","上海"],["华东理工大学","上海","上海"],["上海大学","上海","上海"],["东华大学","上海","上海"],["上海外国语大学","上海","上海"],["海军军医大学","上海","上海"],["南京理工大学","江苏","南京"],["南京航空航天大学","江苏","南京"],["苏州大学","江苏","苏州"],["江南大学","江苏","无锡"],["南京农业大学","江苏","南京"],["南京师范大学","江苏","南京"],["河海大学","江苏","南京"],["中国矿业大学","江苏","徐州"],["中国药科大学","江苏","南京"],["合肥工业大学","安徽","合肥"],["安徽大学","安徽","合肥"],["福州大学","福建","福州"],["南昌大学","江西","南昌"],["中国石油大学（华东）","山东","青岛"],["郑州大学","河南","郑州"],["华中农业大学","湖北","武汉"],["华中师范大学","湖北","武汉"],["武汉理工大学","湖北","武汉"],["中国地质大学（武汉）","湖北","武汉"],["中南财经政法大学","湖北","武汉"],["湖南师范大学","湖南","长沙"],["暨南大学","广东","广州"],["华南师范大学","广东","广州"],["广西大学","广西","南宁"],["海南大学","海南","海口"],["西南大学","重庆","重庆"],["西南交通大学","四川","成都"],["西南财经大学","四川","成都"],["四川农业大学","四川","雅安"],["贵州大学","贵州","贵阳"],["云南大学","云南","昆明"],["西藏大学","西藏","拉萨"],["西安电子科技大学","陕西","西安"],["陕西师范大学","陕西","西安"],["西北大学","陕西","西安"],["长安大学","陕西","西安"],["空军军医大学","陕西","西安"],["青海大学","青海","西宁"],["宁夏大学","宁夏","银川"],["新疆大学","新疆","乌鲁木齐"],["石河子大学","新疆","石河子"]]
const historicalAliases: Readonly<Record<string,string>> = {
  '海军军医大学': '第二军医大学',
  '空军军医大学': '第四军医大学',
  '华北电力大学（保定）': '华北电力大学 保定校区',
}
const allTuples = [
  ...tuples.map(([name,province,city,keywords]) => ({name,province,city,keywords,is985:true})),
  ...other211.map(([name,province,city]) => ({
    name,province,city,keywords: name + ' ' + (historicalAliases[name] || ''),is985:false,
  })),
]
const c9Schools = new Set(["北京大学","清华大学","复旦大学","上海交通大学","南京大学","浙江大学","中国科学技术大学","西安交通大学","哈尔滨工业大学"])
const verifiedExtras: Record<string, Partial<School>> = {
  "南京大学": {
    "website": "https://www.nju.edu.cn/",
    "intro": "南京大学前身为1902年创办的三江师范学堂，1950年更名为南京大学。学校位于江苏南京，历史沿革和办学情况以南京大学官网公开介绍为准。",
    "introSource": "https://www.nju.edu.cn/ndgk/ndjj.htm",
    "address": "江苏省南京市栖霞区仙林大道163号（仙林校区）",
    "addressSource": "https://history.nju.edu.cn/e7/e9/c28610a452585/page.htm",
    "founded": "1902",
    "verifiedStats": {
      "campusCount": 4,
      "collegeCount": 40,
      "doubleFirstSubjects": 16,
      "sourceUrl": "https://yzb.nju.edu.cn/main.htm",
      "sourceChecked": "2026-10-10"
    },
    "admissions": {
      "title": "南京大学研究生招生网",
      "url": "https://yzb.nju.edu.cn/",
      "catalogsTitle": "2026年9月研究生学科专业目录",
      "catalogsUrl": "https://xkb.nju.edu.cn/zysz/list.htm",
      "summerTitle": "夏令营与推免通知",
      "summerUrl": "https://yzb.nju.edu.cn/"
    }
  },
  "北京大学": {
    "website": "https://www.pku.edu.cn/",
    "intro": "北京大学创办于1898年，初名京师大学堂，1912年更名为北京大学。学校发展历程可查看其官网《北京大学简介》。",
    "introSource": "https://www.pku.edu.cn/about.html",
    "address": "北京市海淀区颐和园路5号",
    "addressSource": "https://www.pku.edu.cn/",
    "founded": "1898"
  },
  "中南大学": {
    "website": "https://www.csu.edu.cn/",
    "intro": "中南大学位于湖南长沙，本条目依据教育部985工程名单与学校官网已核实的公开信息建立。项目和院系信息仍以当年官方招生目录为准。",
    "introSource": "https://www.csu.edu.cn/",
    "address": "湖南省长沙市麓山南路932号",
    "addressSource": "https://www.csu.edu.cn/",
    "founded": ""
  },
  "中国科学技术大学": {
    "website": "https://ustc.edu.cn/",
    "intro": "中国科学技术大学位于安徽合肥，入选教育部公布的985工程建设高校名单。学校官网提供学校概况、院系介绍与研究生教育入口。",
    "introSource": "https://ustc.edu.cn/",
    "address": "",
    "addressSource": "",
    "founded": ""
  }
}

export const SCHOOLS: readonly School[] = allTuples.map(({name,province,city,keywords,is985}, index) => ({
  id: 's' + String(index + 1).padStart(3, '0'),
  name, province, city, keywords,
  isC9: c9Schools.has(name), is985, is211: true,
  campusRecord: name === '华北电力大学（保定）',
  sourceUrl: is985 ? MOE_985_SOURCE : MOE_211_SOURCE,
  website: '', intro: '', introSource: '', address: '', addressSource: '', founded: '',
  ...verifiedExtras[name],
}))

export function getSchoolById(id: string): School | undefined {
  return SCHOOLS.find(school => school.id === id)
}

export type SchoolTier = 'all' | 'c9' | '985' | '211' | 'other211'
export function findSchools(query: string, tier: SchoolTier, province: string): School[] {
  const needle = query.trim().toLowerCase().replace(/\s+/g, '')
  return SCHOOLS.filter((school) => (
    (tier === 'all' || tier === '211' || tier === 'c9' && school.isC9 ||
      tier === '985' && school.is985 || tier === 'other211' && !school.is985) &&
    (province === '全部地区' || school.province === province) &&
    (!needle || [school.name,school.province,school.city,school.keywords]
      .some(text => text.toLowerCase().replace(/\s+/g, '').includes(needle)))
  ))
}
export const SCHOOL_REGIONS = ['全部地区', ...Array.from(new Set(SCHOOLS.map(s => s.province)))]
