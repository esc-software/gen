import { createRegistry, type Tool, type ToolRegistry } from '@esc/gen-core';
import { base64Tool } from './base64.js';
import { cnpjTool } from './cnpj.js';
import { cpfTool } from './cpf.js';
import { characterCounterTool, lineCounterTool, wordCounterTool } from './counters.js';
import { daysBetweenTool } from './dates.js';
import { cnhTool, pisTool } from './documents.js';
import { fileSizeTool, numberBaseTool, temperatureTool, urlEncodeTool } from './converters.js';
import { gradientTool } from './gradient.js';
import { hashTool } from './hash.js';
import { jsonTool } from './json.js';
import { loremTool } from './lorem.js';
import { passwordTool } from './password.js';
import { slugTool } from './slug.js';
import { syllableCounterTool } from './syllables.js';
import { tokenTool } from './token.js';
import { uuidTool } from './uuid.js';
import { spreadsheetTools } from './spreadsheets.js';
import { pdfTools } from './pdf.js';
import { imageTools } from './images.js';
import { utilityTools } from './utilities.js';
import { cssMinifierTool, htmlFormatterTool, markdownFormatterTool, sqlFormatterTool } from './formatters.js';
import { contractTool, declarationTool, emailSignatureTool, privacyPolicyTool, receiptTool, resumeTool, seoTagsTool } from './documents-gen.js';
import { coloringCharacterTool } from './art.js';
import { demoBoletoTool, demoCardTool, demoPayslipTool, demoReceiptTool, fakeBankAccountTool, testCardsTool } from './finance-demo.js';
import { barcodeTool, linkBuilderTool, pixDemoTool, pixGeneratorTool, qrCodeTool, whatsappLinkTool, wifiTool } from './codes.js';
import { fakeRgTool, cnsGeneratorTool, companyNameTool, fakeAddressTool, fakeEmailTool, fakePersonTool, gameNickTool, plateGeneratorTool, raffleTool, randomNameTool, randomNumberTool, randomSentenceTool, stateRegistrationTool, usernameTool } from './generators.js';
import { areaTool, averageTool, discountTool, percentageTool, ruleOfThreeTool, scientificCalculatorTool, simpleCalculatorTool, tipTool, volumeTool } from './calc-math.js';
import { commissionTool, compoundInterestTool, creditCardInterestTool, inflationTool, installmentTool, loanTool, marginTool, overdraftTool, payrollLoanTool, roiTool, simpleInterestTool } from './calc-finance.js';
import { ageTool, barbecueTool, businessDaysTool, concreteTool, dateCalculatorTool, downloadTimeTool, electricityTool, ethanolOrGasolineTool, flooringTool, fuelEfficiencyTool, paintTool, pizzaTool, sleepCycleTool, tripCostTool, waterUseTool, workedHoursTool } from './calc-daily.js';
import { bmiTool, bmrTool, caloriesTool, dogAgeTool, idealWeightTool, macrosTool, menstrualCycleTool, ovulationTool, pregnancyTool } from './calc-health.js';
import { ascendantTool, enemTool, numerologyTool } from './calc-fun.js';
import { lifeExpectancyTool } from './calc-life.js';
import { fgtsTool, incomeTaxTool, inssTool, netSalaryTool, nightShiftTool, overtimeTool, thirteenthTool, transportVoucherTool, vacationTool } from './payroll.js';
import { domesticTerminationTool, pjSalaryTool, retirementTool, terminationTool } from './payroll2.js';

import { colorTool } from './colors.js';
import { csvToJsonTool, jsonToYamlTool } from './data-formats.js';
import { moneyWordsTool, numberWordsTool } from './extenso.js';
import { removeAccentsTool, textConverterTool } from './text.js';
import { timeZoneTool, timestampTool } from './time.js';
import { speedTool, unitsTool } from './units.js';
import { cepTool, cnsTool, phoneTool, pixKeyTool, plateTool, renavamTool, tituloTool } from './validators-br.js';
import { cardTool, dateTool, emailTool, ibanTool, ipTool, primeTool, regexTool, strongPasswordTool, urlTool, xmlTool } from './validators-intl.js';

/**
 * Catálogo de ferramentas. Para adicionar uma ferramenta: crie o módulo em `src/`
 * exportando um `defineTool(...)` e inclua-o nesta lista. Web, CLI e extensão
 * enxergam a novidade automaticamente; o núcleo não muda.
 */
export const tools: readonly Tool[] = [
  // geradores
  uuidTool,
  tokenTool,
  passwordTool,
  hashTool,
  loremTool,
  gradientTool,
  cpfTool,
  cnpjTool,
  fakePersonTool, stateRegistrationTool, fakeAddressTool, randomNameTool, companyNameTool, fakeEmailTool, usernameTool, randomSentenceTool, randomNumberTool, gameNickTool, plateGeneratorTool, cnsGeneratorTool, raffleTool,
  qrCodeTool, wifiTool, barcodeTool, whatsappLinkTool, linkBuilderTool, pixGeneratorTool, pixDemoTool,
  demoCardTool, testCardsTool, fakeBankAccountTool, demoBoletoTool, demoReceiptTool, demoPayslipTool,
  emailSignatureTool, seoTagsTool, receiptTool, declarationTool, contractTool, resumeTool, privacyPolicyTool, coloringCharacterTool, fakeRgTool,
  // validadores
  cnhTool,
  pisTool,
  tituloTool,
  cnsTool,
  renavamTool,
  plateTool,
  cepTool,
  phoneTool,
  pixKeyTool,
  emailTool,
  urlTool,
  ipTool,
  cardTool,
  ibanTool,
  xmlTool,
  dateTool,
  primeTool,
  strongPasswordTool,
  regexTool,
  // contadores
  wordCounterTool,
  characterCounterTool,
  lineCounterTool,
  syllableCounterTool,
  daysBetweenTool,
  // conversores
  timestampTool,
  timeZoneTool,
  colorTool,
  unitsTool,
  speedTool,
  textConverterTool,
  removeAccentsTool,
  numberWordsTool,
  moneyWordsTool,
  jsonToYamlTool,
  csvToJsonTool,
  base64Tool,
  slugTool,
  temperatureTool,
  fileSizeTool,
  numberBaseTool,
  urlEncodeTool,
  // calculadoras
  simpleCalculatorTool, scientificCalculatorTool, percentageTool, ruleOfThreeTool, averageTool, discountTool, tipTool, areaTool, volumeTool,
  simpleInterestTool, compoundInterestTool, loanTool, installmentTool, creditCardInterestTool, overdraftTool, payrollLoanTool, inflationTool, marginTool, roiTool, commissionTool,
  fuelEfficiencyTool, ethanolOrGasolineTool, tripCostTool, waterUseTool, electricityTool, downloadTimeTool, paintTool, flooringTool, concreteTool, pizzaTool, barbecueTool,
  workedHoursTool, dateCalculatorTool, businessDaysTool, ageTool, sleepCycleTool,
  bmiTool, bmrTool, caloriesTool, idealWeightTool, macrosTool, pregnancyTool, ovulationTool, menstrualCycleTool, dogAgeTool,
  numerologyTool, ascendantTool, enemTool, lifeExpectancyTool,
  inssTool, incomeTaxTool, netSalaryTool, thirteenthTool, vacationTool, fgtsTool, transportVoucherTool, overtimeTool, nightShiftTool,
  terminationTool, domesticTerminationTool, retirementTool, pjSalaryTool,
  // planilhas
  ...spreadsheetTools,
  // pdf
  ...pdfTools,
  // imagens
  ...imageTools,
  // utilidades interativas
  ...utilityTools,
  // formatadores
  jsonTool, sqlFormatterTool, cssMinifierTool, htmlFormatterTool, markdownFormatterTool,
];

export function createDefaultRegistry(): ToolRegistry {
  const registry = createRegistry();
  registry.registerAll(tools);
  return registry;
}

/** Registro compartilhado com todas as ferramentas do catálogo. */
export const registry: ToolRegistry = createDefaultRegistry();

export {
  cepTool, cnsTool, phoneTool, pixKeyTool, plateTool, renavamTool, tituloTool,
  cardTool, dateTool, emailTool, ibanTool, ipTool, primeTool, regexTool, strongPasswordTool, urlTool, xmlTool,
  base64Tool,
  characterCounterTool,
  cnhTool,
  cnpjTool,
  cpfTool,
  daysBetweenTool,
  fileSizeTool,
  gradientTool,
  hashTool,
  jsonTool,
  lineCounterTool,
  loremTool,
  numberBaseTool,
  passwordTool,
  pisTool,
  slugTool,
  syllableCounterTool,
  temperatureTool,
  tokenTool,
  urlEncodeTool,
  uuidTool,
  wordCounterTool,
};
export { decodeBase64, encodeBase64 } from './base64.js';
export { calculateCNPJCheckDigits, formatCNPJ, generateCNPJ, validateCNPJ } from './cnpj.js';
export { calculateCPFCheckDigits, formatCPF, generateCPF, validateCPF } from './cpf.js';
export { countCharacters, countLines, countWords } from './counters.js';
export { differenceBetween, parseIsoDate } from './dates.js';
export { generateCNH, generatePIS, validateCNH, validatePIS } from './documents.js';
export { convertBase, convertFileSize, convertTemperature } from './converters.js';
export { buildGradient, parseColorStops } from './gradient.js';
export { hashText } from './hash.js';
export { describeJsonError, processJson } from './json.js';
export { generateLorem } from './lorem.js';
export { generatePassword } from './password.js';
export { removeDiacritics, slugify } from './slug.js';
export { countSyllables, countSyllablesPt } from './syllables.js';
export { generateToken } from './token.js';
export { generateUuid } from './uuid.js';
export * from './roadmap.js';
export {
  calculateRenavamCheckDigit, calculateTituloCheckDigits, computeCnsDefinitivo, validateCEP, validateCNS,
  validatePhoneBR, validatePixKey, validatePlate, validateRenavam, validateTitulo,
} from './validators-br.js';
export {
  assessPassword, factorize, ibanMod97, isPrime, luhnValid, parseIPv4, parseIPv6, runRegex, validateCard,
  validateDateText, validateEmail, validateIban, validateIp, validatePrimeInput, validateUrl, validateXml,
} from './validators-intl.js';
export { colorTool, csvToJsonTool, jsonToYamlTool, moneyWordsTool, numberWordsTool, removeAccentsTool, speedTool, textConverterTool, timeZoneTool, timestampTool, unitsTool };
export { contrastRatio, convertColor, parseColor } from './colors.js';
export { csvToJson, jsonToYaml } from './data-formats.js';
export { moneyToWords, numberToWords } from './extenso.js';
export { convertText, splitWords } from './text.js';
export { formatOffset, isValidTimeZone, offsetMinutes, parseLocalDateTime, wallClock, zonedTimeToUtc } from './time.js';
export { convertUnit } from './units.js';
export * from './calc-math.js';
export * from './calc-finance.js';
export * from './calc-daily.js';
export * from './calc-health.js';
export * from './calc-fun.js';
export * from './calc-life.js';
export * from './payroll.js';
export * from './payroll2.js';
export * from './payroll-data.js';
export { evaluate } from './expr.js';
export * from './generators.js';
export * from './br-data.js';
export * from './codes.js';
export * from './finance-demo.js';
export * from './documents-gen.js';
export * from './art.js';
export * from './formatters.js';
export * from './spreadsheets.js';
export * from './sheet-builder.js';
export * from './xl-formula.js';
export * from './pdf.js';
export * from './image-codec.js';
export * from './images.js';
export * from './utilities.js';
