import { Bar } from "react-chartjs-2";
import "chart.js/auto";

export default function Dashboard() {
  const data = {
    labels: ["Pending", "Approved", "Rejected"],
    datasets: [
      {
        label: "Documents",
        data: [12, 30, 5],
      },
    ],
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-6">
        <div className="bg-white p-5 shadow rounded">
          <p>Total Documents</p>
          <h3 className="text-xl font-bold">47</h3>
        </div>

        <div className="bg-yellow-100 p-5 shadow rounded">
          <p>Pending</p>
          <h3 className="text-xl font-bold">12</h3>
        </div>

        <div className="bg-green-100 p-5 shadow rounded">
          <p>Approved</p>
          <h3 className="text-xl font-bold">30</h3>
        </div>

        <div className="bg-red-100 p-5 shadow rounded">
          <p>Rejected</p>
          <h3 className="text-xl font-bold">5</h3>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white p-6 shadow rounded">
        <Bar data={data} />
      </div>
    </div>
  );
}