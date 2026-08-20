export interface SeoFaq {
  question: string
  answer: string
}

export interface ModelCategoryPage {
  slug: string
  filter: string
  navLabel: string
  title: string
  h1: string
  description: string
  intro: string
  faqs: SeoFaq[]
}

export interface VramPage {
  slug: string
  gb: number
  title: string
  h1: string
  description: string
  intro: string
  fits: string
  exampleHref: string
  exampleLabel: string
  faqs: SeoFaq[]
}

export const MODEL_CATEGORY_PAGES: ModelCategoryPage[] = [
  {
    slug: "chat",
    filter: "text",
    navLabel: "Chat & LLMs",
    title: "Best local LLMs you can run | CanIRun.ai",
    h1: "Local LLMs you can run",
    description:
      "Find open chat and reasoning models that fit your GPU or Mac. Compare VRAM, speed and quality for local LLMs — no cloud API.",
    intro:
      "These are open chat, coding and reasoning models you can download and run on your own machine. We grade each one against the GPU or Apple Silicon detected in your browser.",
    faqs: [
      {
        question: "What is a local LLM?",
        answer:
          "A local LLM is an open-weight language model that runs on your computer instead of a cloud API. Prompts stay on the device, there is no usage meter, and you can keep working offline.",
      },
      {
        question: "How much VRAM do I need for a local LLM?",
        answer:
          "A 7B–9B chat model usually fits in 8 GB of VRAM at Q4. 12–16 GB covers most 12B–27B models. 24 GB and up opens 30B dense models and mid-size mixture-of-experts.",
      },
      {
        question: "Can I run a local LLM on a Mac?",
        answer:
          "Yes. Apple Silicon shares unified memory between CPU and GPU, so an M-series Mac can run the same open models that would need a discrete GPU on Windows.",
      },
    ],
  },
  {
    slug: "coding",
    filter: "code",
    navLabel: "Coding",
    title: "Best local coding models | CanIRun.ai",
    h1: "Local coding models",
    description:
      "Best open coding models you can run locally. Compare Qwen Coder, Devstral, Ornith and other LLMs for your GPU or Mac.",
    intro:
      "Open models trained or tuned for code completion, refactoring and agentic software work. Check which ones fit your VRAM and how fast they generate tokens on your machine.",
    faqs: [
      {
        question: "What is the best local coding model?",
        answer:
          "It depends on your VRAM. On 8 GB, compact Qwen Coder or Devstral-class models are the usual pick. With 16–24 GB you can run larger coding mixtures that hold more context and use tools.",
      },
      {
        question: "Can I run a coding LLM offline?",
        answer:
          "Yes. Once the GGUF weights are downloaded, models on this page run with runai, Ollama or LM Studio without sending code to a cloud provider.",
      },
      {
        question: "Do local coding models support tools and agents?",
        answer:
          "Many do. Look for tool-use on the model page. Agentic coding models can call a terminal or editor, but they still need enough memory to stay fast.",
      },
    ],
  },
  {
    slug: "image",
    filter: "image",
    navLabel: "Image",
    title: "Local image generation models | CanIRun.ai",
    h1: "Local image generation models",
    description:
      "Run FLUX, Qwen Image, Z-Image and Hunyuan Image locally. See VRAM requirements and which GPUs can generate images on-device.",
    intro:
      "Open text-to-image models you can run without a cloud GPU. Memory is the limit: tiny checkpoints fit on 8 GB cards, while FLUX.2-class models want 16–24 GB.",
    faqs: [
      {
        question: "Can I run FLUX locally?",
        answer:
          "Yes. Klein variants fit consumer GPUs. FLUX.2 Dev is a 32B-class checkpoint and wants closer to 24 GB of VRAM at a usable quantization.",
      },
      {
        question: "How much VRAM do I need for local image generation?",
        answer:
          "4–8 GB is enough for compact image models. 12–16 GB covers most mid-size checkpoints. 24 GB is the comfortable range for high-quality open image models.",
      },
      {
        question: "Is local image generation slower than Midjourney?",
        answer:
          "A strong GPU can feel interactive. Integrated graphics and laptops are slower, but the image never leaves your machine.",
      },
    ],
  },
  {
    slug: "video",
    filter: "video",
    navLabel: "Video",
    title: "Local video generation models | CanIRun.ai",
    h1: "Local video generation models",
    description:
      "Run Wan, LTX, Hunyuan Video and MiniMax H3 locally. Check VRAM and which GPUs can generate video on your own hardware.",
    intro:
      "Open video models are the heaviest thing you can run locally. Start with the smallest Wan or LTX checkpoints unless you have 24 GB or more.",
    faqs: [
      {
        question: "Can I generate video locally?",
        answer:
          "Yes, with open models such as Wan, LTX and Hunyuan Video. They need more VRAM and are slower than chat models, but they run offline once downloaded.",
      },
      {
        question: "How much VRAM for local video AI?",
        answer:
          "The smallest video models can start around 8–12 GB. Comfortable 720p-class generation usually wants 16–24 GB. Longer clips and audio-native models go higher.",
      },
      {
        question: "What is the easiest local video model to try?",
        answer:
          "Pick the lightest Wan or LTX checkpoint on this page that grades S–B on your device. That is the fastest way to see if local video is usable on your GPU.",
      },
    ],
  },
  {
    slug: "lightweight",
    filter: "small",
    navLabel: "Lightweight",
    title: "Small LLMs you can run on-device | CanIRun.ai",
    h1: "Small on-device LLMs",
    description:
      "Tiny open models (≤4B) for laptops, phones and edge devices. See which small LLMs run locally with little VRAM.",
    intro:
      "Models at 4B and under. They fit 8 GB cards, many laptops and some phones. Quality is lower than a 27B, but they start instantly and leave memory for other apps.",
    faqs: [
      {
        question: "What is a small language model?",
        answer:
          "A small language model has only a few billion parameters — here, 4B or fewer. They run on modest hardware and are built for edge, mobile and always-on assistants.",
      },
      {
        question: "Can I run an LLM on 8 GB of RAM?",
        answer:
          "Yes. Most models on this page are designed for that budget. Q4 quantization keeps them well under 8 GB of VRAM or unified memory.",
      },
      {
        question: "Are tiny models good enough for chat?",
        answer:
          "They are strong for drafts, classification and simple coding. For hard reasoning or long documents, step up to a 9B–27B if your machine has the memory.",
      },
    ],
  },
]

export const VRAM_PAGES: VramPage[] = [
  {
    slug: "8gb",
    gb: 8,
    title: "Best local AI models for 8GB VRAM | CanIRun.ai",
    h1: "Local AI models for 8GB VRAM",
    description:
      "What can you run on 8GB VRAM? Open LLMs, tiny image models and edge chat — graded for RTX 4060-class cards and 8 GB Macs.",
    intro:
      "8 GB is the most common consumer GPU budget. At Q4 you can run 3B–9B chat models comfortably, plus the smallest image checkpoints. Mixture-of-experts still load every expert, so big MoE files will not fit.",
    fits: "3B–9B chat models at Q4, plus tiny image models.",
    exampleHref: "/device/rtx-4060",
    exampleLabel: "RTX 4060",
    faqs: [
      {
        question: "What LLM can I run on 8GB VRAM?",
        answer:
          "7B–9B dense models at Q4 are the sweet spot. Smaller 1B–4B models will feel faster. Avoid 14B+ dense checkpoints and large MoE files unless you offload to system RAM (much slower).",
      },
      {
        question: "Is 8GB enough for local image generation?",
        answer:
          "Yes for compact models such as FLUX Klein 4B or similar. Full FLUX.2 Dev and large video models will not fit.",
      },
    ],
  },
  {
    slug: "12gb",
    gb: 12,
    title: "Best local AI models for 12GB VRAM | CanIRun.ai",
    h1: "Local AI models for 12GB VRAM",
    description:
      "Open models that fit 12GB VRAM. 12B–14B chat, compact MoE and light image generation for RTX 4070-class GPUs.",
    intro:
      "12 GB unlocks the 12B–14B class at Q4 and leaves headroom for context. It is the step up from an 8 GB card without jumping to 16 GB workstation memory.",
    fits: "12B–14B dense models, or smaller mixture-of-experts.",
    exampleHref: "/device/rtx-4070",
    exampleLabel: "RTX 4070",
    faqs: [
      {
        question: "What can I run on a 12GB GPU?",
        answer:
          "Most 12B–14B instruct models at Q4, plus 7B–9B at higher quality. Compact image models run well. Video still wants more memory.",
      },
    ],
  },
  {
    slug: "16gb",
    gb: 16,
    title: "Best local AI models for 16GB VRAM | CanIRun.ai",
    h1: "Local AI models for 16GB VRAM",
    description:
      "Best open models for 16GB VRAM or unified memory. 20B–27B chat, coding LLMs and local image generation.",
    intro:
      "16 GB is the comfortable laptop and mid-range desktop budget — including many Apple Silicon Macs. 20B–27B dense models fit at Q4, and 14B models can run at higher quality.",
    fits: "20B–27B at Q4, comfortable 14B at higher quality.",
    exampleHref: "/device/m4",
    exampleLabel: "Apple M4",
    faqs: [
      {
        question: "Is 16GB VRAM enough for a local LLM?",
        answer:
          "Yes. It covers the models most people actually want to run daily: strong 14B–27B chat and coding checkpoints, plus mid-size image generation.",
      },
      {
        question: "Can a 16GB Mac run local AI?",
        answer:
          "An M-series Mac with 16 GB unified memory can run the same class of models as a 16 GB GPU, with speed depending on the chip (base vs Pro vs Max).",
      },
    ],
  },
  {
    slug: "24gb",
    gb: 24,
    title: "Best local AI models for 24GB VRAM | CanIRun.ai",
    h1: "Local AI models for 24GB VRAM",
    description:
      "What runs on 24GB VRAM? 30B dense models, mid-size MoE, FLUX-class image and local video on RTX 4090-class GPUs.",
    intro:
      "24 GB is the enthusiast sweet spot. 30B dense models fit, mid-size mixture-of-experts become usable, and local image or short video generation is realistic.",
    fits: "30B dense models, mid-size MoE, or local video.",
    exampleHref: "/device/rtx-4090",
    exampleLabel: "RTX 4090",
    faqs: [
      {
        question: "What models can an RTX 4090 run locally?",
        answer:
          "Almost every popular open chat and coding model at high quality, plus FLUX-class image generation and the lighter video checkpoints.",
      },
    ],
  },
  {
    slug: "32gb",
    gb: 32,
    title: "Best local AI models for 32GB VRAM | CanIRun.ai",
    h1: "Local AI models for 32GB+ VRAM",
    description:
      "Open MoE, high-quality image and local video models for 32GB VRAM, RTX 5090-class cards and high-memory Macs.",
    intro:
      "32 GB and above is where large open mixture-of-experts and high-quality image or video models stop feeling like a stretch. Headroom also means longer context without spilling to system RAM.",
    fits: "Larger open MoE and high-quality image generation.",
    exampleHref: "/device/rtx-5090",
    exampleLabel: "RTX 5090",
    faqs: [
      {
        question: "Do I need 32GB to run local AI well?",
        answer:
          "No. Most daily chat and coding fits in 8–16 GB. 32 GB matters when you want large MoE, long context, or local video at a usable resolution.",
      },
    ],
  },
]

export const CATEGORY_ALIASES: Record<string, string> = {
  llm: "/models/chat",
  llms: "/models/chat",
  "local-llms": "/models/chat",
  code: "/models/coding",
  "coding-models": "/models/coding",
  "image-generation": "/models/image",
  "text-to-image": "/models/image",
  "video-generation": "/models/video",
  small: "/models/lightweight",
  edge: "/models/lightweight",
  "on-device": "/models/lightweight",
}

export const COMPANY_ALIASES: Record<string, string> = {
  qwen: "/company/alibaba",
  llama: "/company/meta",
  muse: "/company/meta",
  gemma: "/company/google",
  phi: "/company/microsoft",
  mistral: "/company/mistral-ai",
  glm: "/company/z-ai",
  zhipu: "/company/z-ai",
  flux: "/company/black-forest-labs",
  bfl: "/company/black-forest-labs",
  kimi: "/company/moonshot-ai",
  hunyuan: "/company/tencent",
  smollm: "/company/hugging-face",
  lfm: "/company/liquid-ai",
  olmo: "/company/allen-ai",
  "gpt-oss": "/company/openai",
  longcat: "/company/meituan",
  ltx: "/company/lightricks",
  ornith: "/company/deep-reinforce",
  nemotron: "/company/nvidia",
}

export const VRAM_ALIASES: Record<string, string> = {
  "8gb-vram": "/vram/8gb",
  "12gb-vram": "/vram/12gb",
  "16gb-vram": "/vram/16gb",
  "24gb-vram": "/vram/24gb",
  "32gb-vram": "/vram/32gb",
}

export function getCategoryBySlug(slug: string): ModelCategoryPage | undefined {
  return MODEL_CATEGORY_PAGES.find((page) => page.slug === slug)
}

export function getCategoryPath(filter: string): string {
  if (!filter || filter === "all") return "/models"
  const page = MODEL_CATEGORY_PAGES.find((item) => item.filter === filter)
  return page ? `/models/${page.slug}` : "/models"
}

export function getVramBySlug(slug: string): VramPage | undefined {
  return VRAM_PAGES.find((page) => page.slug === slug)
}

export function astroRedirects(): Record<string, string> {
  return {
    "/device": "/devices",
    "/browse": "/models",
    "/local-ai-models": "/models",
    "/local-llms": "/models/chat",
    "/local-coding-models": "/models/coding",
    "/local-image-models": "/models/image",
    "/local-video-models": "/models/video",
    ...Object.fromEntries(
      Object.entries(CATEGORY_ALIASES).map(([alias, target]) => [
        `/models/${alias}`,
        target,
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(COMPANY_ALIASES).map(([alias, target]) => [
        `/company/${alias}`,
        target,
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(VRAM_ALIASES).map(([alias, target]) => [
        `/${alias}`,
        target,
      ]),
    ),
  }
}
