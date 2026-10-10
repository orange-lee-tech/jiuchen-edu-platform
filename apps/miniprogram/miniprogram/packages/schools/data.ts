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
export const DOUBLE_FIRST_CLASS_2022_SOURCE = 'https://origin-www.csc.edu.cn/article/2363'
export const DOUBLE_FIRST_CLASS_MOE_NOTICE = 'https://www.moe.gov.cn/srcsite/A22/s7065/202202/t20220211_598710.html'
/** Official second-round 2022 list, 147 institutions, not an annual admissions rating.
 * Official historical name 上海体育学院 is displayed by its current name 上海体育大学.
 * The 211 保定 campus record is a second record for the same institution.
 */
export const DOUBLE_FIRST_CLASS_2022 = `北京大学、中国人民大学、清华大学、北京交通大学、北京工业大学、北京航空航天大学、北京理工大学、北京科技大学、北京化工大学、北京邮电大学、中国农业大学、北京林业大学、北京协和医学院、北京中医药大学、北京师范大学、首都师范大学、北京外国语大学、中国传媒大学、中央财经大学、对外经济贸易大学、外交学院、中国人民公安大学、北京体育大学、中央音乐学院、中国音乐学院、中央美术学院、中央戏剧学院、中央民族大学、中国政法大学、南开大学、天津大学、天津工业大学、天津医科大学、天津中医药大学、华北电力大学、河北工业大学、山西大学、太原理工大学、内蒙古大学、辽宁大学、大连理工大学、东北大学、大连海事大学、吉林大学、延边大学、东北师范大学、哈尔滨工业大学、哈尔滨工程大学、东北农业大学、东北林业大学、复旦大学、同济大学、上海交通大学、华东理工大学、东华大学、上海海洋大学、上海中医药大学、华东师范大学、上海外国语大学、上海财经大学、上海体育学院、上海音乐学院、上海大学、南京大学、苏州大学、东南大学、南京航空航天大学、南京理工大学、中国矿业大学、南京邮电大学、河海大学、江南大学、南京林业大学、南京信息工程大学、南京农业大学、南京医科大学、南京中医药大学、中国药科大学、南京师范大学、浙江大学、中国美术学院、安徽大学、中国科学技术大学、合肥工业大学、厦门大学、福州大学、南昌大学、山东大学、中国海洋大学、中国石油大学（华东）、郑州大学、河南大学、武汉大学、华中科技大学、中国地质大学（武汉）、武汉理工大学、华中农业大学、华中师范大学、中南财经政法大学、湘潭大学、湖南大学、中南大学、湖南师范大学、中山大学、暨南大学、华南理工大学、华南农业大学、广州医科大学、广州中医药大学、华南师范大学、海南大学、广西大学、四川大学、重庆大学、西南交通大学、电子科技大学、西南石油大学、成都理工大学、四川农业大学、成都中医药大学、西南大学、西南财经大学、贵州大学、云南大学、西藏大学、西北大学、西安交通大学、西北工业大学、西安电子科技大学、长安大学、西北农林科技大学、陕西师范大学、兰州大学、青海大学、宁夏大学、新疆大学、石河子大学、中国矿业大学（北京）、中国石油大学（北京）、中国地质大学（北京）、宁波大学、南方科技大学、上海科技大学、中国科学院大学、国防科技大学、海军军医大学、空军军医大学`.split('、')
const doubleFirstSet = new Set<string>(DOUBLE_FIRST_CLASS_2022)

export type School = {
  id: string
  name: string
  province: string
  city: string
  keywords: string
  isC9: boolean
  is985: boolean
  is211: boolean
  isDoubleFirst: boolean
  affiliationKey: SchoolAffiliationKey | 'none'
  affiliationLabel: string
  groupTags: Array<{ key: SchoolGroupKey; label: string }>
  campusRecord: boolean
  sourceUrl: string
  website: string
  intro: string
  introSource: string
  address: string
  addressSource: string
  founded: string
  /** Licensed real campus photo; leave undefined unless source + rights reviewed. */
  heroPhoto?: {
    url: string
    caption: string
    author: string
    license: string
    licenseUrl: string
    sourceUrl: string
  }
  /** A verified GCJ-02 campus point, not a fabricated city-center marker. */
  mapLocation?: {
    campus: string
    latitude: number
    longitude: number
    sourceUrl: string
  }
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
// Individually sourced non-211 law schools: never mark them as MoE 211 members.
const specialtySchools: ReadonlyArray<readonly [string,string,string,string,string]> = [
  ['华东政法大学','上海','上海','huadongzhengfadaxue ecup','https://www.ecupl.edu.cn/'],
  ['西南政法大学','重庆','重庆','xinan zhengfa swupl','https://eedfx.swupl.edu.cn/zcfw/xxjs/63ec9340aecb47838faf368afa1f18a2.htm'],
  ['西北政法大学','陕西','西安','xibeizhengfa nwupl','https://www.nwupl.edu.cn/hjgk/hjjg/66293.htm'],
]
const specialtySourceByName = new Map(specialtySchools.map(([name,,,,sourceUrl])=>[name,sourceUrl]))
/** 2022 official list additions not present in the historical 985/211 roster.
 * Regional fields identify the institution's main locality; not campus routing.
 */
const newDoubleFirst: ReadonlyArray<readonly [string,string,string]> = [
  ['北京协和医学院','北京','北京'],['首都师范大学','北京','北京'],['外交学院','北京','北京'],
  ['中国人民公安大学','北京','北京'],['中国音乐学院','北京','北京'],['中央美术学院','北京','北京'],
  ['中央戏剧学院','北京','北京'],['天津工业大学','天津','天津'],['天津中医药大学','天津','天津'],
  ['山西大学','山西','太原'],['上海海洋大学','上海','上海'],['上海中医药大学','上海','上海'],
  ['上海体育大学','上海','上海'],['上海音乐学院','上海','上海'],['南京邮电大学','江苏','南京'],
  ['南京林业大学','江苏','南京'],['南京信息工程大学','江苏','南京'],['南京医科大学','江苏','南京'],
  ['南京中医药大学','江苏','南京'],['中国美术学院','浙江','杭州'],['河南大学','河南','开封'],
  ['湘潭大学','湖南','湘潭'],['华南农业大学','广东','广州'],['广州医科大学','广东','广州'],
  ['广州中医药大学','广东','广州'],['西南石油大学','四川','成都'],['成都理工大学','四川','成都'],
  ['成都中医药大学','四川','成都'],['宁波大学','浙江','宁波'],['南方科技大学','广东','深圳'],
  ['上海科技大学','上海','上海'],['中国科学院大学','北京','北京'],
]
/** Selective publicly run, non-985/211 and non-2022-double-first-class institutions;
 * membership of a historical specialty cluster is NOT a formal admissions grade.
 */
const notablePublic: ReadonlyArray<readonly [string,string,string,string]> = [
 ['深圳大学','广东','深圳','https://www.szu.edu.cn/'],
 ['西安建筑科技大学','陕西','西安','https://www.xauat.edu.cn/'],
 ['燕山大学','河北','秦皇岛','https://www.ysu.edu.cn/'],
 ['沈阳建筑大学','辽宁','沈阳','https://www.sjzu.edu.cn/'],
 ['首都医科大学','北京','北京','https://www.ccmu.edu.cn/'],
 ['广东外语外贸大学','广东','广州','https://www.gdufs.edu.cn/'],
 ['南京工业大学','江苏','南京','https://www.njtech.edu.cn/'],
 ['江苏大学','江苏','镇江','https://www.ujs.edu.cn/'],
 ['浙江工业大学','浙江','杭州','https://www.zjut.edu.cn/'],
 ['杭州电子科技大学','浙江','杭州','https://www.hdu.edu.cn/'],
 ['重庆邮电大学','重庆','重庆','https://www.cqupt.edu.cn/'],
 ['昆明理工大学','云南','昆明','https://www.kmust.edu.cn/'],
 ['华侨大学','福建','泉州','https://www.hqu.edu.cn/'],
 ['中国社会科学院大学','北京','北京','https://www.ucass.edu.cn/'],
 ['南方医科大学','广东','广州','https://www.smu.edu.cn/'],
 // Six Minzu Commission schools: the remaining five complement existing 中央民族大学.
 ['中南民族大学','湖北','武汉','https://www.scuec.edu.cn/'],
 ['西南民族大学','四川','成都','https://www.swun.edu.cn/'],
 ['西北民族大学','甘肃','兰州','https://www.xbmu.edu.cn/'],
 ['北方民族大学','宁夏','银川','https://www.nmu.edu.cn/'],
 ['大连民族大学','辽宁','大连','https://www.dlnu.edu.cn/'],
]
const publicSchoolSources = new Map(notablePublic.map(([name,,,url])=>[name,url]))
const allTuples = [
  ...tuples.map(([name,province,city,keywords]) => ({name,province,city,keywords,is985:true,is211:true})),
  ...other211.map(([name,province,city]) => ({
    name,province,city,keywords: name + ' ' + (historicalAliases[name] || ''),is985:false,is211:true,
  })),
  ...specialtySchools.map(([name,province,city,keywords])=>({name,province,city,keywords,is985:false,is211:false})),
  ...newDoubleFirst.map(([name,province,city])=>({name,province,city,keywords:name,is985:false,is211:false})),
  ...notablePublic.map(([name,province,city])=>({name,province,city,keywords:name,is985:false,is211:false})),
]
const c9Schools = new Set(["北京大学","清华大学","复旦大学","上海交通大学","南京大学","浙江大学","中国科学技术大学","西安交通大学","哈尔滨工业大学"])
/**
 * Industry-recognized informal groupings, NOT Ministry labels or admissions ranks.
 * Historic group membership is institution-level; four legacy departments
 * correspond to their parent universities' modern law schools.
 */
export type SchoolGroupKey =
  | 'huawu' | 'law' | 'defense7' | 'finance3' | 'electronics3'
  | 'mechanical5' | 'mechanical4' | 'architecture8' | 'architecture4'
  | 'electric2' | 'electric4' | 'engineering4' | 'law5' | 'law4' | 'teachers6'
export const SCHOOL_GROUPS: ReadonlyArray<{
  key: SchoolGroupKey
  label: string
  description: string
  members: readonly string[]
  sourceUrl?: string
}> = [
  { key: 'huawu', label: '华五', description: '民间常用的华东五校合称，非教育部院校等级', members: ['复旦大学','上海交通大学','南京大学','浙江大学','中国科学技术大学'] },
  { key: 'law', label: '五院四系', description: '传统法学五院与四校法学院，成员完整；非官方高校等级', members: ['中国政法大学','西南政法大学','华东政法大学','西北政法大学','中南财经政法大学','北京大学','中国人民大学','武汉大学','吉林大学'] },
  { key: 'defense7', label: '国防七子', description: '行业常用的七所工信特色高校合称，不代表招生资格', members: ['北京航空航天大学','北京理工大学','哈尔滨工业大学','哈尔滨工程大学','西北工业大学','南京航空航天大学','南京理工大学'] },
  { key: 'finance3', label: '两财一贸', description: '中央财经、上海财经、对外经贸的民间合称', members: ['中央财经大学','上海财经大学','对外经济贸易大学'] },
  { key: 'electronics3', label: '两电一邮', description: '电子科技、西安电子科技、北京邮电的民间合称', members: ['电子科技大学','西安电子科技大学','北京邮电大学'] },
  { key: 'mechanical5', label: '机械五虎', description: '机械专业行业习惯合称，非学科评估排名', sourceUrl:'https://kaoyan.xdf.cn/202606/15232845.html', members:['清华大学','上海交通大学','华中科技大学','西安交通大学','哈尔滨工业大学'] },
  { key: 'mechanical4', label: '机械四小龙', description: '历史机械工业特色高校称谓，含非211燕山大学', sourceUrl:'https://www.youzy.cn/js/news/article-37597.html', members:['吉林大学','湖南大学','合肥工业大学','燕山大学'] },
  { key: 'architecture8', label: '建筑老八校', description: '历史建筑教育传统高校组合，含双非西安建筑科技大学', sourceUrl:'https://www.beiyangyijiang.com/news/old-eight/', members:['清华大学','东南大学','同济大学','天津大学','华南理工大学','重庆大学','哈尔滨工业大学','西安建筑科技大学'] },
  { key: 'architecture4', label: '建筑新四军', description: '民间存在不同口径，采用浙大、湖大、大工、沈建的参考版本', sourceUrl:'https://www.youzy.cn/js/news/article-37597.html', members:['浙江大学','湖南大学','大连理工大学','沈阳建筑大学'] },
  { key: 'electric2', label: '电气二龙', description: '传统电力行业历史称谓；武汉水电校已并入武汉大学', sourceUrl:'https://www.maigoo.com/news/667480.html', members:['华北电力大学','武汉大学'] },
  { key: 'electric4', label: '电气四虎', description: '电气行业惯用四校称谓，不代表当年保研录取资格', sourceUrl:'https://www.maigoo.com/news/667480.html', members:['清华大学','西安交通大学','浙江大学','华中科技大学'] },
  { key: 'engineering4', label: '四大工学院', description: '历史四所工学院对应现存大学', sourceUrl:'https://www.youzy.cn/js/news/article-37597.html', members:['东南大学','华南理工大学','华中科技大学','大连理工大学'] },
  { key: 'law5', label: '法学五院', description: '传统法学五院，不等于教育部官方排名', sourceUrl:'https://www.sohu.com/a/712821661_121124336', members:['中国政法大学','西南政法大学','华东政法大学','西北政法大学','中南财经政法大学'] },
  { key: 'law4', label: '法学四系', description: '历史四所大学法学系，对应现今大学', sourceUrl:'https://www.sohu.com/a/712821661_121124336', members:['北京大学','中国人民大学','武汉大学','吉林大学'] },
  { key: 'teachers6', label: '部属师范六校', description: '教育部直属六所师范高校（包括原西南师范大学并入的西南大学）；系机构归属，不是排名', members:['北京师范大学','华东师范大学','东北师范大学','华中师范大学','陕西师范大学','西南大学'] },
]
const groupMembership = SCHOOL_GROUPS.map(group => ({
  key: group.key,
  label: group.label,
  members: new Set(group.members),
}))
/** These are current responsible institutions, NOT historical "former ministry" labels.
 * Keep deliberately scoped to entries with verified institutional evidence.
 */
export type SchoolAffiliationKey = 'moe' | 'miit' | 'cas' | 'unitedFront' | 'mfa' | 'mps' | 'neac' | 'cass'
export const SCHOOL_AFFILIATIONS: ReadonlyArray<{
 key:SchoolAffiliationKey; label:string; members:readonly string[]; sourceUrl:string
}> = [
 {key:'moe',label:'教育部',sourceUrl:'https://www.moe.gov.cn/jyb_zzjg/moe_347/',
  members:`北京大学、清华大学、中国人民大学、北京师范大学、中国农业大学、北京外国语大学、北京科技大学、北京化工大学、北京交通大学、北京邮电大学、中国地质大学（北京）、中国矿业大学（北京）、中国石油大学（北京）、北京林业大学、中国传媒大学、中央财经大学、中国政法大学、中央音乐学院、中央戏剧学院、中央美术学院、北京中医药大学、对外经济贸易大学、华北电力大学、南开大学、天津大学、大连理工大学、东北大学、吉林大学、东北师范大学、东北林业大学、复旦大学、上海交通大学、同济大学、华东理工大学、东华大学、华东师范大学、上海外国语大学、上海财经大学、南京大学、东南大学、中国矿业大学、河海大学、江南大学、南京农业大学、中国药科大学、合肥工业大学、浙江大学、厦门大学、山东大学、中国海洋大学、中国石油大学（华东）、武汉大学、华中科技大学、中国地质大学（武汉）、武汉理工大学、华中师范大学、华中农业大学、中南财经政法大学、中南大学、湖南大学、中山大学、华南理工大学、重庆大学、西南大学、四川大学、西南财经大学、西南交通大学、电子科技大学、西安交通大学、西北农林科技大学、陕西师范大学、西安电子科技大学、长安大学、兰州大学`.split('、')},
 {key:'miit',label:'工业和信息化部',sourceUrl:'https://www.miit.gov.cn/xbymdz/dblj/index.html',
  members:['北京航空航天大学','北京理工大学','哈尔滨工业大学','哈尔滨工程大学','西北工业大学','南京航空航天大学','南京理工大学']},
 {key:'cas',label:'中国科学院',sourceUrl:'https://www.cas.cn/',
  members:['中国科学技术大学','中国科学院大学']},
 {key:'unitedFront',label:'中央统战部',sourceUrl:'https://www.jnu.edu.cn/2514/list.htm',
  members:['暨南大学','华侨大学']},
 {key:'mfa',label:'外交部',sourceUrl:'https://www.cfau.edu.cn/',members:['外交学院']},
 {key:'mps',label:'公安部',sourceUrl:'https://www.ppsuc.edu.cn/',members:['中国人民公安大学']},
 {key:'neac',label:'国家民委',sourceUrl:'https://www.neac.gov.cn/seac/',members:['中央民族大学','中南民族大学','西南民族大学','西北民族大学','北方民族大学','大连民族大学']},
 {key:'cass',label:'中国社会科学院',sourceUrl:'https://www.ucass.edu.cn/',members:['中国社会科学院大学']},
]
const affiliationByName = new Map<string,{key:SchoolAffiliationKey;label:string}>(
  SCHOOL_AFFILIATIONS.flatMap(x=>x.members.map(name=>[name,{key:x.key,label:x.label}] as const))
)
const verifiedExtras: Record<string, Partial<School>> = {
  "北京航空航天大学": {
    "mapLocation": { "campus": "学院路校区", "latitude": 39.982212, "longitude": 116.347225, "sourceUrl": "https://ditu.amap.com/place/B000A830XU" }
  },
  "北京理工大学": {
    "mapLocation": { "campus": "中关村校区", "latitude": 39.959984, "longitude": 116.315469, "sourceUrl": "https://ditu.amap.com/place/B000A83H2R" }
  },
  "哈尔滨工业大学": {
    "mapLocation": { "campus": "一校区", "latitude": 45.743265, "longitude": 126.632923, "sourceUrl": "https://amap.com/place/B01C304VUW" }
  },
  "哈尔滨工程大学": {
    "mapLocation": { "campus": "主校区北2门", "latitude": 45.777967, "longitude": 126.680920, "sourceUrl": "https://www.amap.com/place/B01C30LDRK" }
  },
  "西北工业大学": {
    "mapLocation": { "campus": "友谊校区", "latitude": 34.243675, "longitude": 108.915417, "sourceUrl": "https://www.amap.com/place/B001D07SN2" }
  },
  "南京航空航天大学": {
    "mapLocation": { "campus": "明故宫校区", "latitude": 32.035022, "longitude": 118.820282, "sourceUrl": "https://www.amap.com/place/B001912IUJ" }
  },
  "南京理工大学": {
    "mapLocation": { "campus": "孝陵卫校区一号门", "latitude": 32.032914, "longitude": 118.859527, "sourceUrl": "https://www.amap.com/place/B00190ADQE" }
  },
  "吉林大学": {
    "website": "https://www.jlu.edu.cn/",
    "intro": "吉林大学位于吉林省长春市，始建于1946年，现为教育部直属全国重点综合性大学。学校发展和招生以学校官网发布的信息为准。",
    "introSource": "https://www.jlu.edu.cn/info/1011/58071.htm",
    "founded": "1946",
    "address": "吉林省长春市前进大街2699号（前卫南区）",
    "addressSource": "https://www.jlu.edu.cn/info/1238/36174.htm",
    "heroPhoto": {
      "url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/62/Jilin_University_Nanling_Campus.jpg/960px-Jilin_University_Nanling_Campus.jpg",
      "caption": "吉林大学南岭校区校门（非地图所示前卫南区）",
      "author": "Air7538",
      "license": "CC BY-SA 4.0",
      "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
      "sourceUrl": "https://commons.wikimedia.org/wiki/File:Jilin_University_Nanling_Campus.jpg"
    },
    "mapLocation": {
      "campus": "前卫南区",
      "latitude": 43.823761,
      "longitude": 125.277063,
      "sourceUrl": "https://ditu.amap.com/place/B01AF0C7AM"
    }
  },
  "南京大学": {
    "heroPhoto": {
      "url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/41/Nanjing_University%2C_Gulou_Campus.jpg/500px-Nanjing_University%2C_Gulou_Campus.jpg",
      "caption": "南京大学鼓楼校区秋景（非地图所示仙林校区）",
      "author": "FukaiNashi",
      "license": "CC BY-SA 4.0",
      "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
      "sourceUrl": "https://commons.wikimedia.org/wiki/File:Nanjing_University,_Gulou_Campus.jpg"
    },
    "mapLocation": {
      "campus": "仙林校区",
      "latitude": 32.119560,
      "longitude": 118.958406,
      "sourceUrl": "https://amap.com/place/B00190CVRT"
    },
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
  "西南政法大学": {
    "website": "https://www.swupl.edu.cn/",
    "intro": "1950年创办前身西南人民革命大学，1953年成立西南政法学院，1995年升格为西南政法大学；是传统法学五院之一。",
    "introSource": "https://eedfx.swupl.edu.cn/zcfw/xxjs/63ec9340aecb47838faf368afa1f18a2.htm",
    "founded": "1950"
  },
  "西北政法大学": {
    "website": "https://www.nwupl.edu.cn/",
    "intro": "学校前身可追溯至1937年在延安创办的陕北公学，是传统法学五院之一。学校现设长安与雁塔校区。",
    "introSource": "https://www.nwupl.edu.cn/hjgk/hjjg/66293.htm",
    "address": "陕西省西安市西长安街558号（长安校区）",
    "addressSource": "https://zjc.nwupl.edu.cn/gzzd/150600.htm",
    "founded": "1937"
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

export const SCHOOLS: readonly School[] = allTuples.map(({name,province,city,keywords,is985,is211}, index) => ({
  id: 's' + String(index + 1).padStart(3, '0'),
  name, province, city, keywords,
  isC9: c9Schools.has(name), is985, is211,
  isDoubleFirst: doubleFirstSet.has(name === '上海体育大学' ? '上海体育学院' :
    name === '华北电力大学（保定）' ? '华北电力大学' : name),
  affiliationKey: affiliationByName.get(name === '华北电力大学（保定）' ? '华北电力大学' : name)?.key || 'none',
  affiliationLabel: affiliationByName.get(name === '华北电力大学（保定）' ? '华北电力大学' : name)?.label || '',
  groupTags: groupMembership.filter(group => group.members.has(name)).map(({key,label}) => ({key,label})),
  campusRecord: name === '华北电力大学（保定）',
  sourceUrl: specialtySourceByName.get(name) || publicSchoolSources.get(name) ||
    (!is211 ? DOUBLE_FIRST_CLASS_2022_SOURCE : is985 ? MOE_985_SOURCE : MOE_211_SOURCE),
  website: '', intro: '', introSource: '', address: '', addressSource: '', founded: '',
  ...verifiedExtras[name],
}))

export function getSchoolById(id: string): School | undefined {
  return SCHOOLS.find(school => school.id === id)
}

export type SchoolTier = 'all' | 'c9' | '985' | '211' | 'other211' | 'doubleFirst' | 'nonDouble'
export function findSchools(
  query: string, tier: SchoolTier, province: string,
  group: SchoolGroupKey | 'all' = 'all',
  affiliation: SchoolAffiliationKey | 'all' = 'all',
  exactSchool: string = '',
): School[] {
  const needle = query.trim().toLowerCase().replace(/\s+/g, '')
  return SCHOOLS.filter((school) => (
    (tier === 'all' || tier === '211' && school.is211 ||
      tier === 'c9' && school.isC9 ||
      tier === '985' && school.is985 || tier === 'other211' && school.is211 && !school.is985 ||
      tier === 'doubleFirst' && school.isDoubleFirst ||
      tier === 'nonDouble' && !school.is985 && !school.is211 && !school.isDoubleFirst) &&
    (province === '全部地区' || school.province === province) &&
    (group === 'all' || school.groupTags.some(tag => tag.key === group)) &&
    (affiliation === 'all' || school.affiliationKey === affiliation) &&
    (!exactSchool || school.name === exactSchool) &&
    (!needle || [school.name,school.province,school.city,school.keywords]
      .some(text => text.toLowerCase().replace(/\s+/g, '').includes(needle)))
  ))
}
export const SCHOOL_REGIONS = ['全部地区', ...Array.from(new Set(SCHOOLS.map(s => s.province)))]
