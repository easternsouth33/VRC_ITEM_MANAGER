// 分类映射（计划书 §5.5）：BOOTH 分类 → 本地分类
export const BUILTIN_CATEGORIES = [
  '服装', '发型', '配饰', '贴图材质', '天空盒', '场景地图',
  'Shader', '工具脚本', '角色模型', '特效粒子', '交互道具', '其他',
] as const;

export type CategoryName = (typeof BUILTIN_CATEGORIES)[number];

// 关键词 → 分类（内置多语言表，计划书 §5.6）
export interface KeywordRule {
  keyword: string;
  category: CategoryName;
  lang: 'zh' | 'ja' | 'en';
}

export const BUILTIN_KEYWORD_RULES: KeywordRule[] = [
  // 服装
  { keyword: '服', category: '服装', lang: 'zh' },
  { keyword: '衣装', category: '服装', lang: 'ja' },
  { keyword: 'ワンピース', category: '服装', lang: 'ja' },
  { keyword: 'セーラー服', category: '服装', lang: 'ja' },
  { keyword: 'シャツ', category: '服装', lang: 'ja' },
  { keyword: 'スカート', category: '服装', lang: 'ja' },
  { keyword: 'パーカー', category: '服装', lang: 'ja' },
  { keyword: 'dress', category: '服装', lang: 'en' },
  { keyword: 'outfit', category: '服装', lang: 'en' },
  { keyword: 'clothes', category: '服装', lang: 'en' },
  // 服装（鞋袜归服装）
  { keyword: '靴', category: '服装', lang: 'zh' },
  { keyword: '靴下', category: '服装', lang: 'ja' },
  { keyword: 'シューズ', category: '服装', lang: 'ja' },
  { keyword: '鞋', category: '服装', lang: 'zh' },
  { keyword: '袜', category: '服装', lang: 'zh' },
  { keyword: 'ソックス', category: '服装', lang: 'ja' },
  { keyword: 'boots', category: '服装', lang: 'en' },
  { keyword: 'shoes', category: '服装', lang: 'en' },
  { keyword: 'socks', category: '服装', lang: 'en' },
  // 发型
  { keyword: '髪', category: '发型', lang: 'ja' },
  { keyword: 'ヘア', category: '发型', lang: 'ja' },
  { keyword: '髪型', category: '发型', lang: 'ja' },
  { keyword: 'ヘアスタイル', category: '发型', lang: 'ja' },
  { keyword: 'hair', category: '发型', lang: 'en' },
  { keyword: 'hairstyle', category: '发型', lang: 'en' },
  // 配饰
  { keyword: 'アクセサリ', category: '配饰', lang: 'ja' },
  { keyword: '首饰', category: '配饰', lang: 'zh' },
  { keyword: '配饰', category: '配饰', lang: 'zh' },
  { keyword: 'イヤリング', category: '配饰', lang: 'ja' },
  { keyword: 'ピアス', category: '配饰', lang: 'ja' },
  { keyword: 'accessory', category: '配饰', lang: 'en' },
  // 贴图材质
  { keyword: 'テクスチャ', category: '贴图材质', lang: 'ja' },
  { keyword: 'マテリアル', category: '贴图材质', lang: 'ja' },
  { keyword: '贴图', category: '贴图材质', lang: 'zh' },
  { keyword: '材质', category: '贴图材质', lang: 'zh' },
  { keyword: 'texture', category: '贴图材质', lang: 'en' },
  { keyword: 'material', category: '贴图材质', lang: 'en' },
  // 天空盒
  { keyword: 'skybox', category: '天空盒', lang: 'en' },
  { keyword: 'スカイボックス', category: '天空盒', lang: 'ja' },
  { keyword: '空', category: '天空盒', lang: 'zh' },
  { keyword: '天空', category: '天空盒', lang: 'zh' },
  // 场景地图
  { keyword: 'ワールド', category: '场景地图', lang: 'ja' },
  { keyword: 'world', category: '场景地图', lang: 'en' },
  { keyword: 'マップ', category: '场景地图', lang: 'ja' },
  { keyword: '地图', category: '场景地图', lang: 'zh' },
  { keyword: '場景', category: '场景地图', lang: 'zh' },
  // Shader
  { keyword: 'シェーダー', category: 'Shader', lang: 'ja' },
  { keyword: 'シェーダ', category: 'Shader', lang: 'ja' },
  { keyword: 'shader', category: 'Shader', lang: 'en' },
  { keyword: 'シェーダーセット', category: 'Shader', lang: 'ja' },
  // 工具脚本
  { keyword: 'ツール', category: '工具脚本', lang: 'ja' },
  { keyword: 'スクリプト', category: '工具脚本', lang: 'ja' },
  { keyword: 'ツール・スクリプト', category: '工具脚本', lang: 'ja' },
  { keyword: '工具', category: '工具脚本', lang: 'zh' },
  { keyword: 'tool', category: '工具脚本', lang: 'en' },
  { keyword: 'script', category: '工具脚本', lang: 'en' },
];

// BOOTH 分类名 → 本地分类
export const BOOTH_CATEGORY_MAP: Record<string, CategoryName> = {
  '衣装': '服装',
  'アバター服': '服装',
  'アバター': '角色模型',
  '3Dモデル': '角色模型',
  'テクスチャ': '贴图材质',
  'マテリアル': '贴图材质',
  'アクセサリ': '配饰',
  'ヘア': '发型',
  '髪': '发型',
  'Skybox': '天空盒',
  'スカイボックス': '天空盒',
  'ワールド': '场景地图',
  'World': '场景地图',
  'シェーダー': 'Shader',
  'Shader': 'Shader',
  'ツール': '工具脚本',
  'スクリプト': '工具脚本',
};

export function mapBoothCategory(name: string | null, parent: string | null): CategoryName | null {
  if (name && BOOTH_CATEGORY_MAP[name]) return BOOTH_CATEGORY_MAP[name];
  if (parent && BOOTH_CATEGORY_MAP[parent]) return BOOTH_CATEGORY_MAP[parent];
  return null;
}
