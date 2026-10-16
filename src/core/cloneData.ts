/** Core data consists of JSON-compatible records; independent of browser clone globals. */
export function cloneData<T>(value:T):T {
  if(Array.isArray(value))return value.map(item=>cloneData(item)) as T;
  if(value!==null&&typeof value==='object'){
    const result:Record<string,unknown>={};
    for(const [key,item] of Object.entries(value))result[key]=cloneData(item);
    return result as T;
  }
  return value;
}
