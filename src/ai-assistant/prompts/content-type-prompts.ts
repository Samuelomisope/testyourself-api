import { AskUniLibContentType } from '../enums/content-type.enum';

/**
 * One prompt builder per roadmap content-type handler. Each takes the
 * OCR-extracted text (for grounding) and the student's own question
 * (if they typed one) and returns the instruction to send alongside the
 * image to AIService.understandImage().
 */
export function buildPromptForContentType(
  contentType: AskUniLibContentType,
  extractedText: string,
  studentQuestion?: string,
): string {
  const textBlock = extractedText?.trim()
    ? `\n\nText extracted from the image via OCR (may contain minor errors):\n"""${extractedText.slice(0, 4000)}"""`
    : '';
  const studentBlock = studentQuestion?.trim() ? `\n\nThe student specifically asked: "${studentQuestion}"` : '';

  switch (contentType) {
    case AskUniLibContentType.LECTURE_TEXT:
      return `This image shows lecture text or slides. Summarize the key concept(s) clearly and explain them in plain language a student can understand. Highlight any definitions or formulas.${textBlock}${studentBlock}`;

    case AskUniLibContentType.EXAM_QUESTION:
      return `This image shows an examination or assignment question. Identify what is being asked, then give a clear, complete, well-explained answer — not just a final answer, show the reasoning.${textBlock}${studentBlock}`;

    case AskUniLibContentType.MATH_QUESTION:
      return `This image shows a mathematical problem. Solve it step by step, showing each step of the working clearly, and state the final answer distinctly at the end.${textBlock}${studentBlock}`;

    case AskUniLibContentType.DIAGRAM:
      return `This image shows a diagram or figure. Identify and explain each labeled component and how they relate to each other, and explain the overall concept the diagram is illustrating.${textBlock}${studentBlock}`;

    case AskUniLibContentType.MULTIPLE_QUESTIONS:
      return `This image contains more than one distinct question. List each question you can identify (numbered), then answer each one clearly in turn. If the student asked about a specific one, prioritize that one first.${textBlock}${studentBlock}`;

    case AskUniLibContentType.MESSY_NOTES:
      return `This image shows handwritten or disorganized notes. Convert them into clean, organized study material: use headings, bullet points, and clarify anything ambiguous, without inventing content that isn't there.${textBlock}${studentBlock}`;

    case AskUniLibContentType.TEXTBOOK_PAGE:
      return `This image shows a textbook or reference page. Extract and explain the key concepts on this page in a clear, structured way, as if creating study notes from it.${textBlock}${studentBlock}`;

    case AskUniLibContentType.UNKNOWN:
    default:
      return `Look at this image and help the student understand it as best you can. If you cannot make out the content clearly, say so honestly rather than guessing.${textBlock}${studentBlock}`;
  }
}
