export default function Documents() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Documents</h2>

      <div className="bg-white shadow rounded p-4">

        {/* Filters */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <input type="date" className="border p-2" />
          <input type="text" placeholder="Vendor" className="border p-2" />
          <select className="border p-2">
            <option>Status</option>
            <option>Pending</option>
            <option>Approved</option>
            <option>Rejected</option>
          </select>
          <input type="number" placeholder="Min Amount" className="border p-2" />
        </div>

        {/* Table */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="p-2">Invoice #</th>
              <th className="p-2">Vendor</th>
              <th className="p-2">Date</th>
              <th className="p-2">Amount</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>

          <tbody>
            <tr className="text-center border-t">
              <td className="p-2">INV-001</td>
              <td className="p-2">ABC Ltd</td>
              <td className="p-2">2026-02-01</td>
              <td className="p-2">R12,000</td>
              <td className="p-2 text-yellow-600">Pending</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}