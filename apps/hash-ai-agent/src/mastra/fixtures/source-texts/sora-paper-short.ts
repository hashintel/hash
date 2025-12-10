/**
 * Sora Paper - Short Fixture
 *
 * A trimmed version of the Sora paper containing just the author list and abstract.
 * Good for quick iteration and testing Person entity extraction.
 *
 * Source: https://arxiv.org/html/2402.17177v1
 * Expected entities: ~12 Person entities (paper authors)
 */

export const soraPaperShort = {
  sourceText: `Sora: A Review on Background, Technology, Limitations, and Opportunities of Large Vision Models

Authors:
Yixin Liu (Lehigh University), Kai Zhang (Lehigh University), Yuan Li (Lehigh University), Zhiling Yan (Lehigh University), Chujie Gao (Lehigh University), Ruoxi Chen (Lehigh University), Zhengqing Yuan (Lehigh University), Yue Huang (Lehigh University), Hanchi Sun (Lehigh University), Jianfeng Gao (Microsoft Research), Lifang He (Lehigh University), Lichao Sun (Lehigh University)

Note: Equal contributions from first authors. The order was determined by rolling dice. Chujie, Ruoxi, Yuan, Yue, and Zhengqing are visiting students in the LAIR lab at Lehigh University. Lichao Sun is co-corresponding author.

Abstract:
Sora is a text-to-video generative AI model, released by OpenAI in February 2024. The model is trained to generate videos of realistic or imaginative scenes from text instructions and show potential in simulating the physical world. Based on public technical reports and reverse engineering, this paper presents a comprehensive review of the model's background, related technologies, applications, remaining challenges, and future directions of text-to-video AI models. We first trace Sora's development and investigate the underlying technologies used to build this "world simulator". Then, we describe in detail the applications and potential impact of Sora in multiple industries ranging from film-making and education to marketing. We discuss the main challenges and limitations that need to be addressed to widely deploy Sora, such as ensuring safe and unbiased video generation. Lastly, we discuss the future development of Sora and video generation models in general, and how advancements in the field could enable new ways of human-AI interaction, boosting productivity and creativity of video generation.`,

  sourceMeta: {
    uri: "https://arxiv.org/html/2402.17177v1",
    name: "Sora: A Review on Background, Technology, Limitations, and Opportunities of Large Vision Models",
    capturedAt: "2024-02-01T00:00:00Z",
  },

  /** Expected Person entities to extract */
  expectedPersons: [
    "Yixin Liu",
    "Kai Zhang",
    "Yuan Li",
    "Zhiling Yan",
    "Chujie Gao",
    "Ruoxi Chen",
    "Zhengqing Yuan",
    "Yue Huang",
    "Hanchi Sun",
    "Jianfeng Gao",
    "Lifang He",
    "Lichao Sun",
  ],

  /** Expected Organization entities to extract */
  expectedOrganizations: ["Lehigh University", "Microsoft Research", "OpenAI"],

  /** Research goal for testing */
  researchGoal: "Find the authors of the Sora paper and their affiliations",
} as const;

