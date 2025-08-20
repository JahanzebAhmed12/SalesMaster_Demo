import { useEffect, useState } from "react";

export default function DailySummaryPrintPage() {
	const [redirectUrl, setRedirectUrl] = useState<string>("");
	const [error, setError] = useState<string>("");

	useEffect(() => {
		try {
			const params = new URLSearchParams(window.location.search);
			const date = params.get("date");
			const includeStock = params.get("includeStock") === "true";
			const includePurchase = params.get("includePurchase") === "true";
			if (!date) {
				setError("Missing date parameter");
				return;
			}
			const token = localStorage.getItem("jwt_token");
			if (!token) {
				setError("Missing auth token. Please login again.");
				return;
			}
			const origin = window.location.origin;
			const backendOrigin = origin.includes(":5173") ? origin.replace(":5173", ":5000") : origin;
			const url = `${backendOrigin}/api/reports/daily-summary/pdf?date=${encodeURIComponent(
				date
			)}&includeStock=${includeStock}&includePurchase=${includePurchase}&token=${encodeURIComponent(
				token
			)}`;
			setRedirectUrl(url);
			// Redirect to backend HTML for printing
			window.location.replace(url);
		} catch (e: any) {
			setError(e?.message || "Failed to prepare print page");
		}
	}, []);

	return (
		<div style={{ padding: 24, fontFamily: "sans-serif" }}>
			<h2>Preparing Daily Summary print…</h2>
			{error ? (
				<div style={{ color: "#b91c1c", marginTop: 12 }}>{error}</div>
			) : (
				<div style={{ marginTop: 12 }}>
					If you are not redirected automatically, click this link:
					<div style={{ marginTop: 8 }}>
						<a href={redirectUrl}>{redirectUrl || "Open print"}</a>
					</div>
				</div>
			)}
		</div>
	);
} 