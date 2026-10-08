// DataTable and common/Table.jsx used to be two near-identical implementations.
// Table.jsx is now the single canonical implementation (superset of both prop
// contracts); this file just re-exports it so existing `tables/DataTable`
// imports across the app keep working unchanged.
export { default } from '../common/Table';
