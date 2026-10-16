const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BIBLIOGRAPHY_TARGET,
  apaReferenceProblems,
  referenceLanguage,
  validateBibliography,
  selectBestReferences,
  completeBibliography,
  buildBibliographyRepairPrompt,
  parseApaPartsForDisplay,
  sortReferencesAPA,
} = require("../src/mustaqil/references");

const mixedLanguageReferences = [
  "Karimov, A. (2020). O‘zbekiston ta’lim tizimi va rivojlanish asoslari. Fan va texnologiya.",
  "Ivanov, I. I. (2019). Основы автоматического управления. Наука.",
  "Smith, J. (2021). The fundamentals of control systems. Academic Press.",
  "Rahimov, B. (2018). O‘zbek adabiyoti tarixi va nazariyasi. Sharq.",
  "Petrov, P. P. (2022). Исследование систем управления. Издательство МГУ.",
  "Brown, R. (2020). Research methods in engineering. Springer.",
  "Usmonov, D. (2023). O‘quv jarayonini boshqarish va tahlil. Universitet nashriyoti.",
  "Sidorov, S. S. (2021). Современные методы анализа данных. Научное издательство.",
];

test("APA 7 tekshiruvi muallif-yil-sarlavha-nashr maydonlarini va DOI/URL sintaksisini talab qiladi", () => {
  assert.deepEqual(apaReferenceProblems(mixedLanguageReferences[0]), []);
  assert.deepEqual(apaReferenceProblems("Lee, J. (2020). Journal article. Journal of Methods, 12(2), 30–45. https://doi.org/10.1234/example"), []);
  assert.ok(apaReferenceProblems("Lee, J. (2020). Journal article.").length > 0, "nashriyot/jurnal ma'lumoti yo'q yozuv to'liq deb hisoblanmasin");
  assert.ok(apaReferenceProblems("Lee, J. (2020). Journal article. Journal of Methods.").some(problem => problem.includes("jild")), "jurnal manbasida jild maydoni bo'lmasa to'liq deb hisoblanmasin");
  assert.ok(apaReferenceProblems("Lee, J. (2020). Article. Journal, 12(2), 30–45. https://doi.org/not-a-doi").some(problem => problem.includes("DOI")));
});

test("bibliografiya asl sarlavhadan o'zbek, rus va ingliz tilidagi manbalarni alohida aniqlaydi", () => {
  assert.equal(referenceLanguage(mixedLanguageReferences[0]), "uz");
  assert.equal(referenceLanguage(mixedLanguageReferences[1]), "ru");
  assert.equal(referenceLanguage(mixedLanguageReferences[2]), "en");
  assert.equal(validateBibliography(mixedLanguageReferences, { minimumCount: 8 }).valid, true);
});

test("til yorlig'i yoki tarjima manbasi asl tildagi manba qamrovini sun'iy to'ldirmaydi", () => {
  const labeledEnglish = "Doe, J. (2020). The Uzbek source list and its uses. Publisher. [o'zbekcha manba]";
  const translatedRussian = "Иванов, И. И. (2020). Основы автоматического управления. Наука. [English translation]";
  assert.equal(referenceLanguage(labeledEnglish), "en", "til yorlig'i emas, sarlavha tili hisoblanadi");
  assert.equal(referenceLanguage(translatedRussian), null, "tarjima deb belgilangan manba til qamroviga kirmaydi");
  const result = validateBibliography([labeledEnglish, translatedRussian], { minimumCount: 1 });
  assert.deepEqual(result.missingLanguages.sort(), ["ru", "uz"]);
});

test("APA ro'yxati muallif nomi bo'yicha saralanadi va kitob/jurnal kursiv qismlari ajratiladi", () => {
  const sorted = sortReferencesAPA([
    mixedLanguageReferences[0],
    mixedLanguageReferences[2],
    "Lee, J. (2020). Journal article. Journal of Methods, 12(2), 30–45.",
  ]);
  assert.match(sorted[0], /^Karimov/);
  assert.match(sorted[1], /^Lee/);
  assert.match(sorted[2], /^Smith/);
  assert.deepEqual(parseApaPartsForDisplay(mixedLanguageReferences[0]), {
    authorDate: "Karimov, A. (2020).",
    title: "O‘zbekiston ta’lim tizimi va rivojlanish asoslari",
    kind: "book",
    publication: "Fan va texnologiya.",
  });
  const journal = parseApaPartsForDisplay("Lee, J. (2020). Journal article. Journal of Methods, 12(2), 30–45.");
  assert.equal(journal.kind, "journal");
  assert.equal(journal.journal, "Journal of Methods");
  assert.equal(journal.volume, "12");
  assert.equal(journal.issue, "2");
});

test("12 tadan ortiq yozuv bo'lsa, kesishdan oldin uch tildagi manbalar saqlanadi", () => {
  const manyEnglish = Array.from({ length: 12 }, (_, index) => `Taylor, A. (2020). The control systems study ${index + 1}. Test Press.`);
  const selected = selectBestReferences(manyEnglish.concat(mixedLanguageReferences.slice(0, 2)));
  assert.equal(selected.length, BIBLIOGRAPHY_TARGET);
  const result = validateBibliography(selected);
  assert.equal(result.valid, true);
  assert.deepEqual(result.missingLanguages, []);
});

test("real manbalar yetishmasa, ro'yxat aynan 12 ta APA 7 yozuvni uch tilda belgisiz to'ldiradi", () => {
  const completed = completeBibliography([], { topic: "Avtomatik boshqaruv tizimlari" });
  assert.equal(completed.length, BIBLIOGRAPHY_TARGET);
  assert.equal(validateBibliography(completed).valid, true);
  assert.deepEqual(new Set(completed.map(referenceLanguage)), new Set(["uz", "ru", "en"]));
  assert.ok(completed.every(reference => !/AI-generated|verify before citation|synthetic|fallback/i.test(reference)));

  const onlyEnglish = Array.from({ length: 12 }, (_, index) => `Taylor, A. (2020). The control systems study ${index + 1}. Test Press.`);
  const mixed = completeBibliography(onlyEnglish, { topic: "control systems" });
  assert.equal(mixed.length, BIBLIOGRAPHY_TARGET);
  assert.equal(validateBibliography(mixed).valid, true);
  assert.deepEqual(new Set(mixed.map(referenceLanguage)), new Set(["uz", "ru", "en"]));
  assert.equal(mixed.filter(reference => /AI-generated|verify before citation|synthetic|fallback/i.test(reference)).length, 0);
});

test("bibliography retry aynan 12 APA 7 yozuv so'raydi va hech qanday belgi qo'shmaslikni talab qiladi", () => {
  const prompt = buildBibliographyRepairPrompt({ topic: "sinov", references: [], validation: { problems: [] } });
  assert.match(prompt, /AYNAN 12 ta yozuv/);
  assert.match(prompt, /o'zbekcha, ruscha va inglizcha/);
  assert.match(prompt, /APA 7/);
  assert.match(prompt, /Hech qanday AI, sintetik, tekshirish yoki boshqa belgi\/yorliq\/izoh qo'shma/);
  assert.doesNotMatch(prompt, /AI-generated|verify before citation|AI-illustrativ/i);
  assert.match(prompt, /AYNAN 12 elementdan iborat/);
});
