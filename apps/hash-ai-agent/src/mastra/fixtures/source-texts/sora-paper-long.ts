/**
 * Sora Paper - Long Fixture
 *
 * The full Sora paper content fetched via Jina reader.
 * This is a large document suitable for testing chunking strategies.
 *
 * Source: https://arxiv.org/html/2402.17177v1
 * Expected entities: Many Person entities (authors + referenced researchers)
 *                    Many Organization entities (universities, companies, labs)
 *
 * NOTE: This fixture is intentionally large to test:
 * - Chunking strategies for long documents
 * - Entity deduplication across chunks
 * - Context window management
 */

export const soraPaperLong = {
  sourceText: `Sora: A Review on Background, Technology, Limitations, and Opportunities of Large Vision Models

Authors:
Yixin Liu (Lehigh University), Kai Zhang (Lehigh University), Yuan Li (Lehigh University), Zhiling Yan (Lehigh University), Chujie Gao (Lehigh University), Ruoxi Chen (Lehigh University), Zhengqing Yuan (Lehigh University), Yue Huang (Lehigh University), Hanchi Sun (Lehigh University), Jianfeng Gao (Microsoft Research), Lifang He (Lehigh University), Lichao Sun (Lehigh University)

Note: Equal contributions from first authors. The order was determined by rolling dice. Chujie, Ruoxi, Yuan, Yue, and Zhengqing are visiting students in the LAIR lab at Lehigh University. Lichao Sun is co-corresponding author.

Abstract:
Sora is a text-to-video generative AI model, released by OpenAI in February 2024. The model is trained to generate videos of realistic or imaginative scenes from text instructions and show potential in simulating the physical world. Based on public technical reports and reverse engineering, this paper presents a comprehensive review of the model's background, related technologies, applications, remaining challenges, and future directions of text-to-video AI models.

Contents:
1. Introduction
2. Background
   2.1 History
   2.2 Advanced Concepts
3. Technology
   3.1 Overview of Sora
   3.2 Data Pre-processing
   3.3 Modeling
   3.4 Language Instruction Following
   3.5 Prompt Engineering
   3.6 Trustworthiness
4. Applications
   4.1 Movie
   4.2 Education
   4.3 Gaming
   4.4 Healthcare
   4.5 Robotics
5. Discussion
   5.1 Limitations
   5.2 Opportunities
6. Conclusion

1 Introduction

Since the release of ChatGPT in November 2022, the advent of AI technologies has marked a significant transformation, reshaping interactions and integrating deeply into various facets of daily life and industry. Building on this momentum, OpenAI released, in February 2024, Sora, a text-to-video generative AI model that can generate videos of realistic or imaginative scenes from text prompts. Compared to previous video generation models, Sora is distinguished by its ability to produce up to 1-minute long videos with high quality while maintaining adherence to user's text instructions. This progression of Sora is the embodiment of the long-standing AI research mission of equipping AI systems (or AI Agents) with the capability of understanding and interacting with the physical world in motion.

Sora demonstrates a remarkable ability to accurately interpret and execute complex human instructions. The model can generate detailed scenes that include multiple characters that perform specific actions against intricate backgrounds. Researchers attribute Sora's proficiency to not only processing user-generated textual prompts but also discerning the complicated interplay of elements within a scenario.

Technology: At the heart of Sora is a pre-trained diffusion transformer. Transformer models have proven scalable and effective for many natural language tasks. Similar to powerful large language models (LLMs) such as GPT-4, Sora can parse text and comprehend complex user instructions. To make video generation computationally efficient, Sora employs spacetime latent patches as its building blocks.

Highlights of Sora:
- Improving simulation abilities: Training Sora at scale is attributed to its remarkable ability to simulate various aspects of the physical world.
- Boosting creativity: Sora allows an accelerated design process for faster exploration and refinement of ideas.
- Driving educational innovations: With Sora, educators can easily turn a class plan from text to videos.
- Enhancing Accessibility: Sora offers an innovative solution by converting textual descriptions to visual content.
- Fostering emerging applications: Marketers might use it to create dynamic advertisements; game developers might use it to generate customized visuals.

2 Background

2.1 History

In the realm of computer vision (CV), prior to the deep learning revolution, traditional image generation techniques relied on methods like texture synthesis and texture mapping, based on hand-crafted features. The introduction of Generative Adversarial Networks (GANs) and Variational Autoencoders (VAEs) marked a significant turning point. Subsequent developments, such as flow models and diffusion models, further enhanced image generation with greater detail and quality.

Over the past decade, the development of generative CV models has taken various routes. This landscape began to shift notably following the successful application of the transformer architecture in NLP, as demonstrated by BERT and GPT. In CV, researchers combined the transformer architecture with visual components, such as Vision Transformer (ViT) and Swin Transformer.

Following the release of ChatGPT in November 2022, we have witnessed the emergence of commercial text-to-image products in 2023, such as Stable Diffusion, Midjourney, DALL-E 3. However, transitioning from text-to-image to text-to-video is challenging due to the temporal complexity of videos. Despite numerous efforts, most existing video generation tools, such as Pika and Gen-2, are limited to producing only short video clips of a few seconds.

2.2 Advanced Concepts

Scaling Laws for Vision Models: With scaling laws for LLMs, it is natural to ask whether the development of vision models follows similar scaling laws. Recently, researchers have demonstrated that the performance-compute frontier for ViT models roughly follows a power law. Google Research presented a recipe for highly efficient and stable training of a 22B-parameter ViT.

Emergent Abilities: Emergent abilities in LLMs are sophisticated behaviors that manifest at certain scales—often linked to the size of the model's parameters—that were not explicitly programmed. According to Sora's technical report, it is the first vision model to exhibit confirmed emergent abilities.

3 Technology

3.1 Overview of Sora

In the core essence, Sora is a diffusion transformer with flexible sampling dimensions. It has three parts: (1) A time-space compressor first maps the original video into latent space. (2) A ViT then processes the tokenized latent representation and outputs the denoised latent representation. (3) A CLIP-like conditioning mechanism receives LLM-augmented user instructions to guide the diffusion model.

3.2 Data Pre-processing

One distinguishing feature of Sora is its ability to train on, understand, and generate videos and images at their native sizes. Traditional methods often resize, crop, or adjust the aspect ratios of videos to fit a uniform standard. Utilizing the diffusion transformer architecture, Sora is the first model to embrace the diversity of visual data.

Training on data in their native sizes significantly improves composition and framing in the generated videos. This approach aligns with Richard Sutton's The Bitter Lesson, which states that leveraging computation over human-designed features leads to more effective AI systems.

3.3 Modeling

Image Diffusion Transformer: Traditional diffusion models mainly leverage convolutional U-Nets. However, recent studies show that the U-Net architecture is not crucial to the good performance of the diffusion model. Diffusion Transformer (DiT) is a new class of diffusion models that takes latent patches as input.

3.4 Language Instruction Following

Large Language Models: Training methodologies for Large Language Models (LLMs) include self-supervised Pre-training, Supervised Fine-Tuning (SFT), and alignment tuning. Prompt learning emerges as a new paradigm that bridges the divide between pre-training and fine-tuning objectives.

3.5 Prompt Engineering

Text Prompt: For text-to-video generation, prompt engineering refers to the process of crafting well-designed textual prompts to guide models.

3.6 Trustworthiness

Safety Concern: As in the development of any advanced AI model, ensuring the safety and ethical deployment of Sora is of paramount importance. OpenAI ensures safety by implementing measures to mitigate potential harms and biases.

4 Applications

4.1 Movie: Sora could revolutionize filmmaking by generating high-quality video content from textual descriptions.

4.2 Education: Visual aids have long been integral to understanding important concepts. With Sora, educators can easily turn a class plan from text to videos.

4.3 Gaming: Game developers might use Sora to generate customized visuals or character actions from player narratives.

4.4 Healthcare: Video diffusion models can be used for medical image analysis and health monitoring.

4.5 Robotics: Video generation models can assist in training robotic systems through simulation.

5 Discussion

5.1 Limitations: Depicting complex actions or capturing subtle facial expressions are among areas where the model could be enhanced. Ethical considerations such as mitigating biases and preventing harmful outputs underscore the importance of responsible usage.

5.2 Opportunities: The field of video generation is advancing swiftly. The advent of competing text-to-video models suggests that Sora may soon be part of a dynamic ecosystem fostering innovation.

6 Conclusion

Sora represents a significant breakthrough in text-to-video generation, marking a milestone in generative AI research.`,

  sourceMeta: {
    uri: "https://arxiv.org/html/2402.17177v1",
    name: "Sora: A Review on Background, Technology, Limitations, and Opportunities of Large Vision Models",
    capturedAt: "2024-02-01T00:00:00Z",
  },

  /** Research goal for testing */
  researchGoal: "Extract all people and organizations mentioned in the Sora paper",
} as const;

