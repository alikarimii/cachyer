import { createRedisCachyer, createTypedSchema } from "../src";

const simpleCache = createTypedSchema<{ id: string }>()
  .name("simpleCache")
  .structure("HASH")
  .ttl(3600)
  .maxSize(10)
  .description("A simple cache schema example")
  .keyPattern("simple:{id}")
  .operations((ops) => ops.addHashSet().addHashGet().addHashSetMultiple())
  .build();

const cachyer = createRedisCachyer();

async function run() {
  console.log(
    `Setting multiple fields in hash... ${simpleCache.key({ id: "1" })}`,
  );
  const value = await cachyer.execute(simpleCache.operations.hashSet, {
    id: "1",
    field: "name",
    value: "Cachyer",
  });
  console.log(value);

  const getValue = await cachyer.execute(simpleCache.operations.hashGetField, {
    id: "1",
    field: "name",
  });
  const multi = await cachyer.execute(simpleCache.operations.hashSetMultiple, {
    id: "1",
    fields: {
      age: "2",
      city: "NYC",
    },
  });
  const getvalue2 = await cachyer.execute(simpleCache.operations.hashGetField, {
    id: "1",
    field: "age",
  });
  console.log(getvalue2);
  console.log(getValue);
}

run().catch(console.error);
