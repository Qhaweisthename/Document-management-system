export default function Upload() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Upload Document</h2>

      <div className="bg-white p-6 shadow rounded space-y-4">
        
        <input type="file" className="border p-2 w-full" />

        <select className="border p-2 w-full">
          <option value="invoice">Invoice</option>
          <option value="credit_note">Credit Note</option>
        </select>

        <button className="bg-blue-600 text-white px-4 py-2 rounded">
          Upload
        </button>
      </div>

      {/* AI Extraction Preview */}
      <div className="bg-gray-50 p-6 rounded shadow">
        <h3 className="font-bold mb-4">AI Extraction Preview</h3>

        <div className="grid grid-cols-2 gap-4">
          <input placeholder="Vendor" className="border p-2" />
          <input placeholder="Invoice Number" className="border p-2" />
          <input placeholder="Date" className="border p-2" />
          <input placeholder="Amount" className="border p-2" />
          <input placeholder="VAT" className="border p-2" />
          <input placeholder="AI Confidence %" className="border p-2" />
        </div>
      </div>
    </div>
  );
}