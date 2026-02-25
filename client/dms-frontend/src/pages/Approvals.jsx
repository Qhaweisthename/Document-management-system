export default function Approvals() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Approval Queue</h2>

      <div className="bg-white p-6 shadow rounded">
        <table className="w-full">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Vendor</th>
              <th>Amount</th>
              <th>Step</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            <tr className="text-center border-t">
              <td>INV-002</td>
              <td>XYZ Ltd</td>
              <td>R9,000</td>
              <td>Step 2</td>
              <td className="space-x-2">
                <button className="bg-green-600 text-white px-3 py-1 rounded">
                  Approve
                </button>
                <button className="bg-red-600 text-white px-3 py-1 rounded">
                  Reject
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}