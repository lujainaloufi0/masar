import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="empty">
        <h1 style={{ fontSize: 22 }}>Page not found · الصفحة غير موجودة</h1>
        <Link href="/overview" className="btn btn-primary">Masar · مسار</Link>
      </div>
    </div>
  );
}
