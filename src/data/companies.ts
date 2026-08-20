import type { AIModel } from "@/data/models"

export type CompanyLogoKey =
  | "qwen"
  | "meta"
  | "google"
  | "deepseek"
  | "huggingface"
  | "microsoft"
  | "mistral"
  | "zai"
  | "nvidia"
  | "openai"
  | "liquid"
  | "ai2"
  | "tencent"
  | "longcat"
  | "kimi"
  | "ornith"
  | "minimax"
  | "bfl"
  | "ltx"
  | "internscience"
  | "ibm"
  | "cohere"

export interface CompanyInfo {
  slug: string
  name: string
  brand: string
  providers: string[]
  families: string[]
  description: string
  website: string
  logo?: CompanyLogoKey
}

export const ALL_COMPANIES: CompanyInfo[] = [
  {
    slug: "alibaba",
    name: "Alibaba",
    brand: "Qwen",
    providers: ["Alibaba"],
    families: ["Qwen", "Z-Image", "Wan"],
    description:
      "Alibaba's Qwen family spans compact on-device models, multimodal assistants, reasoning systems and large mixture-of-experts models, plus open image generation with Qwen Image and Z-Image and Wan for local video.",
    website: "https://qwen.ai",
    logo: "qwen",
  },
  {
    slug: "meta",
    name: "Meta",
    brand: "Muse",
    providers: ["Meta"],
    families: ["Muse", "Llama"],
    description:
      "Meta develops Muse and Llama, from efficient edge Llama variants to open agentic Muse models designed to run locally.",
    website: "https://developer.meta.com/ai/",
    logo: "meta",
  },
  {
    slug: "google",
    name: "Google",
    brand: "Gemma",
    providers: ["Google"],
    families: ["Gemma"],
    description:
      "Google's Gemma models bring research from Gemini into compact open models for text, vision and on-device use.",
    website: "https://ai.google.dev/gemma",
    logo: "google",
  },
  {
    slug: "deepseek",
    name: "DeepSeek",
    brand: "DeepSeek",
    providers: ["DeepSeek"],
    families: ["DeepSeek"],
    description:
      "DeepSeek builds open-weight reasoning and coding models, including efficient distilled variants and large mixture-of-experts systems.",
    website: "https://www.deepseek.com",
    logo: "deepseek",
  },
  {
    slug: "hugging-face",
    name: "Hugging Face",
    brand: "SmolLM",
    providers: ["HuggingFace"],
    families: ["SmolLM"],
    description:
      "Hugging Face develops open models and the collaborative platform used by the machine-learning community to share them.",
    website: "https://huggingface.co",
    logo: "huggingface",
  },
  {
    slug: "microsoft",
    name: "Microsoft",
    brand: "Phi",
    providers: ["Microsoft"],
    families: ["Phi"],
    description:
      "Microsoft's Phi family focuses on capable small language models designed for efficient local and edge inference.",
    website: "https://azure.microsoft.com/en-us/products/phi",
    logo: "microsoft",
  },
  {
    slug: "mistral-ai",
    name: "Mistral AI",
    brand: "Mistral",
    providers: ["Mistral AI"],
    families: ["Mistral"],
    description:
      "Mistral AI develops efficient open-weight general, multimodal and coding models, including the Mistral, Ministral and Devstral lines.",
    website: "https://mistral.ai",
    logo: "mistral",
  },
  {
    slug: "z-ai",
    name: "Z.ai",
    brand: "GLM",
    providers: ["Z.ai", "Zhipu AI"],
    families: ["GLM"],
    description:
      "Z.ai, formerly known internationally as Zhipu AI, develops the multilingual GLM family of reasoning, coding and agentic models.",
    website: "https://z.ai",
    logo: "zai",
  },
  {
    slug: "nvidia",
    name: "NVIDIA",
    brand: "Nemotron",
    providers: ["NVIDIA"],
    families: ["Nemotron"],
    description:
      "NVIDIA's Nemotron family combines efficient hybrid and mixture-of-experts architectures for local reasoning and agentic workloads.",
    website: "https://www.nvidia.com/en-us/ai/",
    logo: "nvidia",
  },
  {
    slug: "openai",
    name: "OpenAI",
    brand: "GPT-OSS",
    providers: ["OpenAI"],
    families: ["GPT-OSS"],
    description:
      "OpenAI's GPT-OSS models are open-weight mixture-of-experts systems with configurable reasoning and tool-use capabilities.",
    website: "https://openai.com/open-models",
    logo: "openai",
  },
  {
    slug: "liquid-ai",
    name: "Liquid AI",
    brand: "LFM",
    providers: ["Liquid AI"],
    families: ["LFM"],
    description:
      "Liquid AI develops Liquid Foundation Models, efficient hybrid architectures designed for deployment across devices.",
    website: "https://www.liquid.ai",
    logo: "liquid",
  },
  {
    slug: "allen-ai",
    name: "Allen AI",
    brand: "OLMo",
    providers: ["Allen AI"],
    families: ["OLMo"],
    description:
      "The Allen Institute for AI develops OLMo, a fully open family released with its training data, code and research artifacts.",
    website: "https://allenai.org/olmo",
    logo: "ai2",
  },
  {
    slug: "tencent",
    name: "Tencent",
    brand: "Hunyuan",
    providers: ["Tencent"],
    families: ["Hunyuan"],
    description:
      "Tencent's Hunyuan team develops open mixture-of-experts models for coding, agents and long-context work, plus HunyuanImage and HunyuanVideo for local generation.",
    website: "https://hunyuan.tencent.com",
    logo: "tencent",
  },
  {
    slug: "internscience",
    name: "InternScience",
    brand: "Agents-A1",
    providers: ["InternScience"],
    families: ["Agents-A1"],
    description:
      "InternScience is the open-source AI for Science team at Shanghai AI Laboratory, building agentic models and tools for scientific discovery.",
    website: "https://internscience.github.io/Agents-A1/",
    logo: "internscience",
  },
  {
    slug: "meituan",
    name: "Meituan",
    brand: "LongCat",
    providers: ["Meituan"],
    families: ["LongCat"],
    description:
      "Meituan's LongCat team develops frontier-scale open models for coding, long-horizon agents, search and productivity workflows.",
    website: "https://longcat.ai",
    logo: "longcat",
  },
  {
    slug: "moonshot-ai",
    name: "Moonshot AI",
    brand: "Kimi",
    providers: ["Moonshot AI"],
    families: ["Kimi"],
    description:
      "Moonshot AI develops Kimi, a family of long-context multimodal and agentic mixture-of-experts models.",
    website: "https://www.moonshot.ai",
    logo: "kimi",
  },
  {
    slug: "minimax",
    name: "MiniMax",
    brand: "MiniMax",
    providers: ["MiniMax"],
    families: ["MiniMax"],
    description:
      "MiniMax develops multimodal language models and open video generation systems, including MiniMax M3 and H3.",
    website: "https://www.minimax.io",
    logo: "minimax",
  },
  {
    slug: "black-forest-labs",
    name: "Black Forest Labs",
    brand: "FLUX",
    providers: ["Black Forest Labs"],
    families: ["FLUX.2"],
    description:
      "Black Forest Labs develops the FLUX family of open image generation and editing models, from consumer Klein variants to the 32B FLUX.2 Dev checkpoint.",
    website: "https://bfl.ai",
    logo: "bfl",
  },
  {
    slug: "lightricks",
    name: "Lightricks",
    brand: "LTX",
    providers: ["Lightricks"],
    families: ["LTX"],
    description:
      "Lightricks develops LTX, an open video generation family with native audio, from the original LTX-Video models to LTX 2.3.",
    website: "https://ltx.video",
    logo: "ltx",
  },
  {
    slug: "deep-reinforce",
    name: "DeepReinforce",
    brand: "Ornith",
    providers: ["DeepReinforce"],
    families: ["Ornith"],
    description:
      "DeepReinforce develops Ornith, a family of self-improving open-weight models for agentic coding, from compact dense variants to large mixture-of-experts systems.",
    website: "https://deep-reinforce.com",
    logo: "ornith",
  },
  {
    slug: "ibm",
    name: "IBM",
    brand: "Granite",
    providers: ["IBM"],
    families: ["Granite"],
    description:
      "IBM Granite is a family of open enterprise language models for chat, coding, RAG and tool use, from compact edge variants to larger dense instruct models.",
    website: "https://www.ibm.com/granite",
    logo: "ibm",
  },
  {
    slug: "cohere",
    name: "Cohere",
    brand: "North",
    providers: ["Cohere"],
    families: ["North"],
    description:
      "Cohere develops North, an open family of agentic coding models released through Cohere Labs for local software engineering workloads.",
    website: "https://cohere.com",
    logo: "cohere",
  },
]

const COMPANY_BY_SLUG = new Map(
  ALL_COMPANIES.map((company) => [company.slug, company]),
)

const COMPANY_BY_PROVIDER = new Map(
  ALL_COMPANIES.flatMap((company) =>
    company.providers.map((provider) => [provider, company] as const),
  ),
)

export function getCompanyBySlug(slug: string): CompanyInfo | undefined {
  return COMPANY_BY_SLUG.get(slug)
}

export function getCompanyByProvider(
  provider: string,
): CompanyInfo | undefined {
  return COMPANY_BY_PROVIDER.get(provider)
}

export function getCompanyHref(provider: string): string | undefined {
  const company = getCompanyByProvider(provider)
  return company ? `/company/${company.slug}` : undefined
}

export function getCompanyModels(
  company: CompanyInfo,
  catalog: AIModel[],
): AIModel[] {
  const providers = new Set(company.providers)
  return catalog.filter((model) => providers.has(model.provider))
}
