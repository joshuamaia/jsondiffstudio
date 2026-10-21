/**
 * Os módulos de contribuição do Monaco (folding, busca, hover...) e o entry do worker são
 * importados apenas por seus efeitos colaterais e não possuem declarações de tipo.
 */
declare module 'monaco-editor/editor/*';
