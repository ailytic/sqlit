import { Schema, ForeignKeyField } from '../src/model';
import { Value } from '../src/engine';
import helper = require('./helper');

const NAME = 'database';

beforeAll(() => helper.createDatabase(NAME));
afterAll(() => helper.dropDatabase(NAME));

const OPTIONS = {
  models: [
    {
      table: 'product_category',
      fields: [
        {
          column: 'category_id',
          throughField: 'product_id'
        },
        {
          column: 'product_id',
          throughField: 'category_id',
          relatedName: 'categorySet'
        }
      ]
    }
  ]
};

test('select', done => {
  expect.assertions(2);

  const db = helper.connectToDatabase(NAME);
  const options = {
    where: {
      name_like: '%Apple'
    },
    orderBy: 'name',
    offset: 1,
    limit: 1
  };
  db.table('product')
    .select('*', options)
    .then(rows => {
      expect(rows.length).toBe(1);
      expect((rows[0].name as string).indexOf('Australian')).toBe(0);
      done();
    });
});

test('insert', done => {
  expect.assertions(2);

  const db = helper.connectToDatabase(NAME);
  db.table('category')
    .insert({ name: 'Frozen' })
    .then(id => {
      expect(id).toBeGreaterThan(0);
      db.table('category')
        .select('*', { where: { name: 'Frozen' } })
        .then(rows => {
          expect(rows.length).toBe(1);
          done();
        });
    });
});

test('update', done => {
  expect.assertions(3);

  const db = helper.connectToDatabase(NAME);
  db.table('category')
    .insert({ name: 'Ice' })
    .then(id => {
      expect(id).toBeGreaterThan(0);
      db.table('category')
        .update({ name: 'Ice Cream' }, { name: 'Ice' })
        .then(() => {
          db.table('category')
            .select('*', { where: { id } })
            .then(rows => {
              expect(rows.length).toBe(1);
              expect(rows[0].name).toBe('Ice Cream');
              done();
            });
        });
    });
});

test('get success', done => {
  expect.assertions(1);

  const table = helper.connectToDatabase(NAME).table('user');
  table
    .get({
      email: 'alice@example.com',
      firstName: 'Alice'
    })
    .then(row => {
      const lastName = row.lastName;
      table.get(row.id as Value).then(row => {
        expect(row.lastName).toBe(lastName);
        done();
      });
    });
});

test('get fail', done => {
  expect.assertions(1);

  const table = helper.connectToDatabase(NAME).table('user');
  table
    .get({
      firstName: 'Alice'
    })
    .catch(reason => {
      expect(!!/Bad/i.test(reason)).toBe(true);
      done();
    });
});

test('create with connect', done => {
  expect.assertions(1);

  const ID = 1;

  const table = helper.connectToDatabase(NAME).table('order');
  table
    .create({
      user: { connect: { email: 'alice@example.com' } },
      code: `test-order-${ID}`
    })
    .then(order => {
      table.db
        .table('user')
        .get({ email: 'alice@example.com' })
        .then(user => {
          expect(order.user.id).toBe(user.id);
          done();
        });
    });
});

// upsert without update should create or return the existing row
test('upsert #1', done => {
  expect.assertions(1);

  const ID = 2;

  const table = helper.connectToDatabase(NAME).table('order');
  function _upsert() {
    return table
      .upsert({
        user: { connect: { email: 'alice@example.com' } },
        code: `test-order-${ID}`
      })
      .then(order => {
        table.db
          .table('user')
          .get({ email: 'alice@example.com' })
          .then(user => {
            expect(order.user.id).toBe(user.id);
            return user;
          });
      });
  }
  _upsert()
    .then(_upsert)
    .then(user => done());
});

test('upsert #2', done => {
  // expect.assertions(4);
  const ID = 3;

  const table = helper.connectToDatabase(NAME).table('order');

  function _upsert() {
    return table.upsert(
      {
        user: { connect: { email: 'alice@example.com' } },
        code: `test-order-${ID}`
      },
      {
        user: { create: { email: 'nobody@example.com' } },
        code: `test-order-${ID}x`
      }
    );
  }

  _upsert().then(order => {
    expect(order.code).toBe(`test-order-${ID}`);
    table.db
      .table('user')
      .get({ email: 'alice@example.com' })
      .then(user => {
        expect(order.user.id).toBe(user.id);
        _upsert().then(order => {
          expect(order.code).toBe(`test-order-${ID}x`);
          table.db
            .table('user')
            .get({ email: 'nobody@example.com' })
            .then(user => {
              expect(order.user.id).toBe(user.id);
              done();
            });
        });
      });
  });
});

test('update related', async done => {
  expect.assertions(14);

  const table = helper.connectToDatabase(NAME).table('category');

  // connect/create child rows
  let rowCount = await table.count();
  let data: any = {
    name: 'Vegetable',
    parent: {
      connect: {
        id: 1
      }
    },
    categories: {
      create: [
        {
          name: 'Cucumber'
        },
        {
          name: 'Tomato'
        }
      ],
      connect: [
        { parent: { id: 2 }, name: 'Apple' },
        { parent: { id: 2 }, name: 'Banana' }
      ]
    }
  };

  let row: any = await table.create(data);

  let rows: any = await table.select('*');
  expect(rows.length).toBe(rowCount + 3);
  expect(rows.find(r => r.name === data.name).id).toBe(row.id);
  expect(rows.find(r => r.name === 'Cucumber').parent.id).toBe(row.id);
  expect(rows.find(r => r.name === 'Banana').parent.id).toBe(row.id);

  // upsert child rows
  data = {
    where: {
      name: 'Vegetable',
      parent: {
        id: 1
      }
    },
    data: {
      categories: {
        upsert: [
          {
            create: { name: 'Cucumber' },
            update: { name: 'Garlic' }
          },
          {
            create: { name: 'Apple' },
            update: { name: 'Chilli' }
          }
        ]
      }
    }
  };

  rowCount = await table.count();
  row = await table.modify(data.data, data.where);
  rows = await table.select('*');
  expect(rows.length).toBe(rowCount);
  expect(rows.find(r => r.name === 'Garlic').parent.id).toBe(row.id);
  expect(rows.find(r => r.name === 'Chilli').parent.id).toBe(row.id);

  // update child rows
  data = {
    where: {
      name: 'Vegetable',
      parent: {
        id: 1
      }
    },
    data: {
      categories: {
        update: [
          {
            data: { name: 'Apple' },
            where: { name: 'Chilli' }
          },
          {
            data: { name: 'Cucumber' },
            where: { name: 'Garlic' }
          }
        ]
      }
    }
  };

  row = await table.modify(data.data, data.where);
  rows = await table.select('*');
  expect(rows.find(r => r.name === 'Apple').parent.id).toBe(row.id);
  expect(rows.find(r => r.name === 'Cucumber').parent.id).toBe(row.id);

  // delete child rows
  data = {
    where: {
      name: 'Vegetable',
      parent: {
        id: 1
      }
    },
    data: {
      categories: {
        delete: [
          {
            name: 'Tomato'
          },
          {
            name: 'Cucumber'
          }
        ]
      }
    }
  };

  rowCount = await table.count();
  row = await table.modify(data.data, data.where);
  rows = await table.select('*');
  expect(rows.length).toBe(rowCount - 2);
  expect(rows.find(r => r.name === 'Cucumber')).toBe(undefined);
  expect(rows.find(r => r.name === 'Tomato')).toBe(undefined);

  // disconnect child rows
  data = {
    where: {
      name: 'Vegetable',
      parent: {
        id: 1
      }
    },
    data: {
      categories: {
        disconnect: [
          {
            name: 'Apple'
          },
          {
            name: 'Banana'
          }
        ]
      }
    }
  };

  row = await table.modify(data.data, data.where);
  rows = await table.select('*');
  expect(rows.find(r => r.name === 'Apple').parent).toBe(null);
  expect(rows.find(r => r.name === 'Banana').parent).toBe(null);

  done();
});

test('many to many - connect/create', async done => {
  expect.assertions(3);

  const schema = new Schema(helper.getExampleData(), OPTIONS);
  const db = helper.connectToDatabase(NAME, schema);
  const productTable = db.table('product');
  const categoryTable = db.table('category');
  const mappingTable = db.table('product_category');

  await productTable.create({
    sku: 'cream',
    name: 'Cream'
  });

  // connect/create child rows
  let data: any = {
    name: 'Dairy',
    parent: {
      connect: {
        id: 1
      }
    },
    products: {
      create: [
        {
          sku: 'yoghurt',
          name: 'Yoghurt'
        },
        {
          sku: 'butter',
          name: 'Butter'
        }
      ],
      connect: [{ sku: 'cream' }]
    }
  };

  let category: any = await categoryTable.create(data);
  let yoghurt = await productTable.get({ sku: 'yoghurt' });
  let butter = await productTable.get({ sku: 'butter' });
  let cream = await productTable.get({ sku: 'cream' });

  expect(yoghurt.name).toBe('Yoghurt');
  expect(butter.name).toBe('Butter');

  let rows = await mappingTable.select('*', {
    where: [
      {
        product: yoghurt.id,
        category: category.id
      },
      {
        product: butter.id,
        category: category.id
      },
      {
        product: cream.id,
        category: category.id
      }
    ]
  });

  expect(rows.length).toBe(3);

  done();
});

test('many to many - upsert', async done => {
  expect.assertions(3);

  const test = 'upsert';

  const schema = new Schema(helper.getExampleData(), OPTIONS);
  const db = helper.connectToDatabase(NAME, schema);
  const productTable = db.table('product');
  const categoryTable = db.table('category');
  const mappingTable = db.table('product_category');

  await productTable.create({
    sku: `cream-${test}`,
    name: `Cream - ${test}`
  });

  let data: any = {
    name: `Dairy - ${test}`,
    parent: {
      connect: {
        id: 1
      }
    },
    products: {
      upsert: [
        {
          create: { sku: `cream-${test}` },
          update: { name: `Cream - ${test}2` }
        },
        {
          create: {
            sku: `butter-${test}`,
            name: `Butter - ${test}`
          }
        }
      ]
    }
  };

  let category: any = await categoryTable.create(data);
  let butter = await productTable.get({ sku: `butter-${test}` });
  let cream = await productTable.get({ sku: `cream-${test}` });

  expect(butter.name).toBe(`Butter - ${test}`);
  expect(cream.name).toBe(`Cream - ${test}2`);

  let rows = await mappingTable.select('*', {
    where: [
      {
        product: butter.id,
        category: category.id
      },
      {
        product: cream.id,
        category: category.id
      }
    ]
  });

  expect(rows.length).toBe(2);

  done();
});

test('many to many - update', async done => {
  expect.assertions(4);

  const test = 'update';

  const schema = new Schema(helper.getExampleData(), OPTIONS);
  const db = helper.connectToDatabase(NAME, schema);
  const productTable = db.table('product');
  const categoryTable = db.table('category');
  const mappingTable = db.table('product_category');

  await productTable.create({
    sku: `alien-${test}`,
    name: `Alien - ${test}`
  });

  let data: any = {
    name: `Dairy - ${test}`,
    parent: {
      connect: {
        id: 1
      }
    },
    products: {
      create: [
        {
          sku: `cream-${test}`,
          name: `Cream - ${test}`
        },
        {
          sku: `butter-${test}`,
          name: `Butter - ${test}`
        }
      ]
    }
  };

  let category: any = await categoryTable.create(data);

  data = {
    where: {
      name: `Dairy - ${test}`,
      parent: {
        id: 1
      }
    },
    data: {
      products: {
        update: [
          {
            data: { name: `Cream - ${test}2` },
            where: { sku: `cream-${test}` }
          },
          {
            where: { sku: `butter-${test}` },
            data: { name: `Butter - ${test}2` }
          },
          {
            where: { sku: `alien-${test}` },
            data: { name: `Alien - ${test}2` }
          }
        ]
      }
    }
  };

  await categoryTable.modify(data.data, data.where);

  let butter = await productTable.get({ sku: `butter-${test}` });
  let cream = await productTable.get({ sku: `cream-${test}` });
  let alien = await productTable.get({ sku: `alien-${test}` });

  expect(butter.name).toBe(`Butter - ${test}2`);
  expect(cream.name).toBe(`Cream - ${test}2`);
  expect(alien.name).toBe(`Alien - ${test}`);

  let rows = await mappingTable.select('*', {
    where: [
      {
        product: butter.id,
        category: category.id
      },
      {
        product: cream.id,
        category: category.id
      },
      {
        product: alien.id,
        category: category.id
      }
    ]
  });

  expect(rows.length).toBe(2);

  done();
});

test('many to many - delete', async done => {
  expect.assertions(4);

  const test = 'delete';

  const schema = new Schema(helper.getExampleData(), OPTIONS);
  const db = helper.connectToDatabase(NAME, schema);
  const productTable = db.table('product');
  const categoryTable = db.table('category');
  const mappingTable = db.table('product_category');

  let alien = await productTable.create({
    sku: `alien-${test}`,
    name: `Alien - ${test}`
  });

  let data: any = {
    name: `Dairy - ${test}`,
    parent: {
      connect: {
        id: 1
      }
    },
    products: {
      create: [
        {
          sku: `cream-${test}`,
          name: `Cream - ${test}`
        },
        {
          sku: `butter-${test}`,
          name: `Butter - ${test}`
        }
      ]
    }
  };

  let category: any = await categoryTable.create(data);

  data = {
    where: {
      name: `Dairy - ${test}`,
      parent: {
        id: 1
      }
    },
    data: {
      products: {
        delete: [
          {
            sku: `cream-${test}`
          },
          {
            sku: `butter-${test}`
          },
          alien.id
        ]
      }
    }
  };

  await categoryTable.modify(data.data, data.where);

  let butter = await productTable.get({ sku: `butter-${test}` });
  let cream = await productTable.get({ sku: `cream-${test}` });

  alien = await productTable.get({ sku: `alien-${test}` });

  expect(butter).toBe(undefined);
  expect(cream).toBe(undefined);
  expect(alien.name).toBe(`Alien - ${test}`);

  let rows = await mappingTable.select('*', {
    where: [
      {
        category: category.id
      }
    ]
  });

  expect(rows.length).toBe(0);

  done();
});

test('many to many - disconnect', async done => {
  expect.assertions(4);

  const test = 'disconnect';

  const schema = new Schema(helper.getExampleData(), OPTIONS);
  const db = helper.connectToDatabase(NAME, schema);
  const productTable = db.table('product');
  const categoryTable = db.table('category');
  const mappingTable = db.table('product_category');

  await productTable.create({
    sku: `alien-${test}`,
    name: `Alien - ${test}`
  });

  let data: any = {
    name: `Dairy - ${test}`,
    parent: {
      connect: {
        id: 1
      }
    },
    products: {
      create: [
        {
          sku: `cream-${test}`,
          name: `Cream - ${test}`
        },
        {
          sku: `butter-${test}`,
          name: `Butter - ${test}`
        }
      ]
    }
  };

  let category: any = await categoryTable.create(data);

  data = {
    where: {
      name: `Dairy - ${test}`,
      parent: {
        id: 1
      }
    },
    data: {
      products: {
        disconnect: [
          {
            sku: `cream-${test}`
          },
          {
            sku: `alien-${test}`
          }
        ]
      }
    }
  };

  await categoryTable.modify(data.data, data.where);

  let butter = await productTable.get({ sku: `butter-${test}` });
  let cream = await productTable.get({ sku: `cream-${test}` });
  let alien = await productTable.get({ sku: `alien-${test}` });

  expect(butter.name).toBe(`Butter - ${test}`);
  expect(cream.name).toBe(`Cream - ${test}`);
  expect(alien.name).toBe(`Alien - ${test}`);

  let rows = await mappingTable.select('*', {
    where: [
      {
        product: butter.id,
        category: category.id
      },
      {
        product: cream.id,
        category: category.id
      },
      {
        product: alien.id,
        category: category.id
      }
    ]
  });

  expect(rows.length).toBe(1);

  done();
});

test('append', () => {
  const db = helper.connectToDatabase(NAME);
  const table = db.table('category');

  const r1 = table.append({
    name: 'example',
    parent: { id: 1 }
  });

  const r2 = table.append({
    name: 'example',
    parent: 1
  });

  expect(r1.parent).toBe(r2.parent);
  expect(r1).toBe(r2);

  expect(table.recordList.length).toBe(2);
});

test('append #2', async () => {
  const db = helper.connectToDatabase(NAME);
  const email = 'john@example.com';
  db.table('user').append({ email, firstName: 'John' });
  db.table('user').append({ email, firstName: 'Joe' });
  await db.flush();
  const user = await db.table('user').get({ email });
  expect(user.firstName).toBe('Joe');
});

test('claim', async done => {
  const db = helper.connectToDatabase(NAME);
  const table = db.table('order');

  for (let i = 0; i < 10; i++) {
    table.append({ code: `T-${i}`, status: 0 });
  }

  await db.flush();

  const filter = { code_like: 'T-%', status: 0 };
  const update = { status: 1 };

  const promises = [];

  for (let i = 0; i < 11; i++) {
    promises.push(table.claim(filter, update));
  }

  Promise.all(promises).then(async rows => {
    expect(rows.length).toBe(11);
    const empty = rows.filter(row => row === null);
    expect(empty.length).toBe(1);
    rows = await table.select('*', { where: filter });
    expect(rows.length).toBe(0);
    rows = await table.select('*', { where: { ...filter, ...update } });
    expect(rows.length).toBe(10);
    done();
  });
});
