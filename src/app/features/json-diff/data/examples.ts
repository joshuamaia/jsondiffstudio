import { DemoDocuments } from '../services/json-diff.store';

export interface DemoExample extends DemoDocuments {
  readonly id: 'user' | 'order' | 'api' | 'invalid';
  readonly title: string;
  readonly description: string;
}

const user: DemoExample = {
  id: 'user',
  title: 'Cadastro de usuário',
  description: 'Propriedades adicionadas, removidas e alteradas.',
  original: `{"id":1,"nome":"Ana","idade":25,"email":"ana@email.com","telefone":"11999999999","ativo":true,"endereco":{"rua":"Rua A","numero":120}}`,
  modified: `{"id":1,"nome":"Ana","idade":26,"email":"ana.souza@email.com","ativo":true,"endereco":{"rua":"Rua A","numero":120,"cidade":"São Paulo"}}`,
};

const order: DemoExample = {
  id: 'order',
  title: 'Pedido de e-commerce',
  description: 'Cliente, endereço, itens, valores e status. Dica: compare arrays por "id".',
  original: `{
  "pedido": "PED-2026-0042",
  "status": "AGUARDANDO_PAGAMENTO",
  "criadoEm": "2026-10-20T14:32:00Z",
  "cliente": {
    "id": 501,
    "nome": "Carlos Silva",
    "email": "carlos@email.com",
    "endereco": {"rua": "Av. Paulista", "numero": "1000", "complemento": "Apto 12", "cidade": "São Paulo", "uf": "SP", "cep": "01310-100"}
  },
  "itens": [
    {"id": 1, "produto": "Teclado mecânico", "quantidade": 1, "precoUnitario": 349.90},
    {"id": 2, "produto": "Mouse sem fio", "quantidade": 2, "precoUnitario": 129.90},
    {"id": 3, "produto": "Mousepad XL", "quantidade": 1, "precoUnitario": 79.90}
  ],
  "valores": {"subtotal": 689.60, "frete": 25.00, "desconto": 0, "total": 714.60},
  "cupom": "BEMVINDO10",
  "pagamento": {"metodo": "PIX", "parcelas": 1}
}`,
  modified: `{
  "pedido": "PED-2026-0042",
  "status": "ENVIADO",
  "criadoEm": "2026-10-20T14:32:00Z",
  "cliente": {
    "id": 501,
    "nome": "Carlos Silva",
    "email": "carlos@email.com",
    "endereco": {"rua": "Av. Paulista", "numero": "1500", "cidade": "São Paulo", "uf": "SP", "cep": "01310-200"}
  },
  "itens": [
    {"id": 2, "produto": "Mouse sem fio", "quantidade": 1, "precoUnitario": 129.90},
    {"id": 1, "produto": "Teclado mecânico", "quantidade": 1, "precoUnitario": 349.90},
    {"id": 4, "produto": "Headset USB", "quantidade": 1, "precoUnitario": 219.00}
  ],
  "valores": {"subtotal": 698.80, "frete": 0, "desconto": 34.94, "total": 663.86},
  "pagamento": {"metodo": "CARTAO", "parcelas": 3},
  "rastreamento": {"transportadora": "Correios", "codigo": "BR123456789SP"}
}`,
};

const api: DemoExample = {
  id: 'api',
  title: 'Resposta de API REST',
  description: 'Objetos aninhados, arrays com ids, null, mudança de tipos e campos voláteis.',
  original: `{
  "status": 200,
  "meta": {"requestId": "a1b2c3", "timestamp": "2026-10-21T10:00:00Z", "version": 2, "page": {"number": 1, "size": 20, "total": 3}},
  "data": {
    "users": [
      {"id": 9007199254740993, "username": "ana", "roles": ["admin", "editor"], "profile": {"bio": null, "avatar": "https://cdn.exemplo.com/a.png"}, "lastLogin": "2026-10-20T09:15:00Z"},
      {"id": 2, "username": "carlos", "roles": ["viewer"], "profile": {"bio": "Dev backend", "avatar": null}, "lastLogin": null},
      {"id": 3, "username": "bia", "roles": ["editor"], "profile": {"bio": "UX", "avatar": null}, "lastLogin": "2026-10-19T18:40:00Z"}
    ],
    "features": {"darkMode": true, "beta": false, "limits": {"requests": 1000, "storageMb": 512}},
    "tags": null
  },
  "errors": []
}`,
  modified: `{
  "status": 200,
  "meta": {"requestId": "z9y8x7", "timestamp": "2026-10-21T10:05:00Z", "version": "2.1", "page": {"number": 1, "size": 20, "total": 3}},
  "data": {
    "users": [
      {"id": 2, "username": "carlos", "roles": ["viewer", "editor"], "profile": {"bio": "Dev backend", "avatar": null}, "lastLogin": "2026-10-21T08:00:00Z"},
      {"id": 9007199254740993, "username": "ana", "roles": ["admin", "editor"], "profile": {"bio": "Tech lead", "avatar": "https://cdn.exemplo.com/a.png"}, "lastLogin": "2026-10-20T09:15:00Z"},
      {"id": 4, "username": "duda", "roles": ["viewer"], "profile": {"bio": null, "avatar": null}, "lastLogin": null}
    ],
    "features": {"darkMode": true, "beta": true, "limits": {"requests": "1000", "storageMb": 1024}},
    "tags": ["interno"]
  },
  "errors": null
}`,
};

const invalid: DemoExample = {
  id: 'invalid',
  title: 'Carregar JSON inválido',
  description: 'Vírgula sobrando no JSON Modificado: veja o erro, corrija e a comparação volta.',
  original: user.original,
  modified: `{
  "id": 1,
  "nome": "Ana",
  "idade": 26,
  "email": "ana.souza@email.com",
  "ativo": true,
}`,
};

export const DEMO_EXAMPLES: readonly DemoExample[] = [user, order, api];
export const INVALID_EXAMPLE = invalid;
