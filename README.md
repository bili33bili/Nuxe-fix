# Forge Your Files

MASTER PROMPT LOVABLE — PROJECT FORGE



Buat aplikasi web bernama PROJECT FORGE.



PROJECT FORGE adalah Online Project Structure Builder + File Manager + Code Editor + ZIP Builder yang benar-benar berfungsi, bukan sekadar mockup.



1. ATURAN UTAMA



Aplikasi harus:



100% bisa digunakan tanpa login.



JANGAN membuat Google Login.



JANGAN membuat Sign Up/Register.



JANGAN meminta email/password.



JANGAN mewajibkan akun apa pun.



User langsung bisa menggunakan aplikasi begitu website dibuka.



Struktur project sepenuhnya ditentukan oleh user.



Jangan membatasi user hanya pada template tertentu.



Jangan hardcode struktur project.



Tidak boleh ada batas buatan seperti:



maksimum 100 file



maksimum 1.000 file



maksimum 10.000 file



maksimum 100.000 file



maksimum folder tertentu



Jumlah file/folder mengikuti kemampuan perangkat dan browser.



User bisa membuat project sebesar yang masih mampu ditangani perangkatnya.



Penyimpanan utama menggunakan browser/device secara lokal.



Cloud hanya fitur tambahan/opsional.



Tidak boleh ada upload cloud secara diam-diam.



Tidak boleh kehilangan project ketika halaman direfresh.



Tidak boleh muncul blank screen/white screen ketika terjadi error.



Harus responsive untuk Android, tablet, dan desktop.



Semua tombol utama harus benar-benar berfungsi.



Prinsip utama:



YOUR PROJECT. YOUR STRUCTURE. YOUR RULES.



2. LOCAL-FIRST ARCHITECTURE



Gunakan arsitektur:



USER ↓ PROJECT ENGINE ↓ IndexedDB ↓ Offline Capable ↓ Optional Cloud ↓ Supabase / Free-tier Provider 



Gunakan IndexedDB sebagai penyimpanan utama.



Jangan gunakan localStorage sebagai penyimpanan utama untuk project besar.



Project harus tetap tersedia setelah:



refresh



browser ditutup



browser dibuka kembali



offline



koneksi internet hilang



Gunakan autosave yang efisien.



Jangan menulis ke database pada setiap karakter yang diketik.



Gunakan:



debounce



batching



queued writes



snapshot bila diperlukan



Status penyimpanan:



Saving... ✓ Saved locally 



3. OPTIONAL CLOUD



Cloud bersifat:



OPT-IN dan OPTIONAL.



Aplikasi harus tetap berfungsi penuh tanpa cloud.



Jika menggunakan Supabase:



VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY 



Jangan pernah memasukkan:



service role key



database password



private API key



secret key



ke frontend.



Jika cloud tidak tersedia:



Cloud unavailable ✓ Your local project is safe 



Jangan menghapus data lokal karena cloud gagal.



Jangan mewajibkan login Google.



Jangan mewajibkan akun untuk memakai aplikasi.



4. PROJECT ENGINE



Semua fitur harus menggunakan satu sumber data utama bernama:



Project Engine



Explorer, editor, tabs, ZIP exporter, importer, statistics, database, search, undo/redo, dan project library harus membaca state dari engine yang sama.



Jangan membuat state project terpisah untuk setiap fitur.



Gunakan struktur data seperti:



type ProjectNode = { id: string; parentId: string | null; name: string; type: "file" | "folder"; content?: string; size?: number; createdAt: number; updatedAt: number; }; 



Folder:



type = folder content = undefined 



File:



type = file content = string 



5. NEW PROJECT



Buat tombol:



New Project



Ketika diklik tampilkan modal:



Create New Project Project Name [________________] Choose starting point ○ Blank Project ○ Example Project [Cancel] [Create Project] 



Default:



Blank Project



Example Project hanya contoh dan tidak boleh menjadi struktur wajib.



Jika ada perubahan yang belum disimpan, tampilkan konfirmasi sebelum project dihancurkan/diganti.



6. CUSTOM STRUCTURE GENERATOR



Buat fitur:



Generate From Structure



User dapat memasukkan struktur seperti:



my-project/ ├── index.html ├── style.css ├── js/ │ ├── main.js │ └── player.js ├── assets/ │ ├── images/ │ │ └── logo.png │ └── sounds/ │ └── click.mp3 └── README.md 



Parser harus mendukung:



├──



└──



│



indentation



spaces



nested folders



folder dengan /



file tanpa extension



file dengan extension apa pun



nama dengan -



nama dengan _



nama dengan .



nama dengan spaces



struktur sangat dalam



Jangan hanya mendukung:



React



Vue



Node



Python



HTML



User harus bebas membuat struktur apa pun.



Contoh:



game/ ├── engine/ ├── characters/ ├── maps/ ├── sounds/ ├── shaders/ └── config.dat 



harus bisa.



Jika parser menemukan kesalahan:



jangan menghapus project lama



jangan merusak project saat ini



tampilkan error yang jelas



tunjukkan bagian struktur yang bermasalah jika memungkinkan



7. MANUAL FILE CREATION



Buat tombol:



New File



Dialog:



New File Name [________________] Location [Root ▼] [Cancel] [Create] 



User bebas menggunakan extension apa pun:



.html .css .js .ts .json .py .txt .md .cpp .java .lua .dat .xyz 



atau tanpa extension.



Tidak boleh membatasi extension.



8. MANUAL FOLDER CREATION



Buat:



New Folder



Dialog:



New Folder Folder Name [________________] Parent [Root ▼] [Cancel] [Create] 



Harus mendukung nested folder tanpa batas buatan.



9. FILE EXPLORER



Buat File Explorer seperti VS Code.



Fitur:



expand folder



collapse folder



open file



rename



delete



duplicate



move



drag & drop



download



copy path



context menu



Contoh:



PROJECT ├── 📁 src │ ├── 📄 main.js │ └── 📄 player.js ├── 📁 assets │ ├── 📁 images │ └── 📁 sounds └── 📄 index.html 



Untuk project besar:



gunakan virtualized tree



render hanya node yang terlihat



lazy-load folder



jangan merender ribuan node sekaligus



10. CONTEXT MENU



Klik kanan desktop atau long press mobile:



Open New File New Folder Rename Duplicate Move Download Copy Path Delete 



Context menu harus mengikuti node yang dipilih.



11. RENAME



User bisa rename:



file



folder



project



Validasi:



nama kosong → error



nama tidak valid → error



nama duplikat dalam parent yang sama → error



Jangan merusak struktur project.



12. DELETE



Delete file/folder harus meminta konfirmasi.



Contoh:



Delete "assets"? This folder and its contents will be removed. [Cancel] [Delete] 



Setelah delete:



Folder deleted [Undo] 



Undo harus benar-benar mengembalikan data.



13. DUPLICATE



Dukung:



duplicate file



duplicate folder



Contoh:



player.js player copy.js 



Untuk folder:



assets/ assets copy/ 



Semua isi folder harus ikut ter-copy.



14. MOVE



Dukung:



drag & drop



context menu → Move



memilih parent folder



Jangan mengizinkan:



folder A └── folder B └── folder A 



Cegah circular movement.



15. CODE EDITOR



Buat editor mirip mini VS Code.



Jika cocok gunakan:



Monaco Editor



Fitur:



syntax highlighting



line numbers



multiple tabs



search



replace



undo



redo



copy



paste



keyboard shortcuts



Ctrl+S



autosave



unsaved indicator



Contoh tab:



index.html main.js player.js 



Jika belum disimpan:



index.html ● 



Jika tersimpan:



index.html ✓ 



Editor harus terasa seperti editor desktop sungguhan.



16. FILE TABS



Buat tab editor:



index.html × main.js × player.js × 



Dukung:



open



close



switch



close active



close others



close all



Jika ada perubahan belum tersimpan, jangan langsung membuangnya.



17. AUTOSAVE



Autosave harus:



cepat



stabil



tidak membebani IndexedDB



menggunakan debounce



batching jika perlu



Contoh:



Saving... 



kemudian:



✓ Saved locally 



Jangan menulis database setiap keypress.



18. UNDO / REDO



Dukung undo/redo untuk:



membuat file



membuat folder



delete



rename



duplicate



move



edit content



Gunakan history yang efisien.



Jangan membuat memory leak untuk project besar.



19. SEARCH



Buat search project.



Cari:



nama file



nama folder



isi file jika memungkinkan



Search harus:



debounce



cepat



tidak freeze



mendukung project besar



menggunakan indexing jika diperlukan



Untuk hasil sangat banyak gunakan virtualized result list.



20. DOWNLOAD FILE



User bisa klik kanan:



Download



Untuk satu file, browser harus mengunduh isi file sesuai nama file.



Jangan membutuhkan backend.



21. ZIP EXPORT



Buat tombol:



Export ZIP



ZIP harus mempertahankan:



root folder



folder



subfolder



file



file content



struktur asli



Contoh:



my-project.zip my-project/ ├── index.html ├── css/ │ └── style.css └── js/ └── main.js 



Gunakan:



JSZip atau library yang sesuai.



Tidak membutuhkan backend.



22. ZIP EXPORT PROGRESS



Untuk project besar jangan freeze UI.



Tampilkan:



Creating ZIP... Files: 1,240 Folders: 320 Processed: 740 / 1,240 ████████████░░░░░ [Cancel] 



Gunakan:



chunking



worker jika cocok



incremental processing



progress update



Setelah selesai:



✓ ZIP Ready 



23. ZIP IMPORT



Buat:



Import ZIP



User memilih ZIP menggunakan browser file picker.



Aplikasi tidak boleh mengakses file perangkat tanpa izin user.



Setelah dipilih:



Importing ZIP... Files: 240 Folders: 80 ██████████████░░ 



ZIP invalid/corrupt:



Could not import ZIP. Your existing project was not changed. 



Jangan menghapus project lama jika import gagal.



24. JSON BACKUP



Buat:



Export Project



format:



.project.json 



File JSON harus berisi struktur project dan content yang diperlukan untuk restore.



Buat:



Import Project



Jika JSON corrupt:



tampilkan error



jangan merusak project lama



25. PROJECT LIBRARY



Buat halaman/panel:



Project Library



Project disimpan lokal.



Setiap project memiliki:



id name createdAt updatedAt storageType fileCount folderCount totalSize 



Aksi:



Open



Rename



Duplicate



Export



Delete



Project tetap ada setelah refresh.



26. STATISTICS



Tampilkan statistik real-time:



Files: 24 Folders: 8 Size: 2.4 MB 



Update otomatis setelah:



create



delete



rename



move



edit



Jangan menetapkan maksimum statistik.



27. UNLIMITED-BY-DESIGN



PENTING:



Jangan membuat artificial limit.



Jangan menulis kode seperti:



if (files.length > 100000) { throw new Error("Maximum files reached"); } 



Jangan melakukan pembatasan semacam itu.



Sebaliknya, gunakan:



virtualization



lazy rendering



lazy folder expansion



IndexedDB



batching



debounce



workers



efficient tree representation



incremental ZIP generation



search indexing



Jika perangkat benar-benar tidak mampu:



This project is too large for this device/browser to process safely right now. Your saved project data has not been intentionally deleted. Try closing other tabs/apps or reopening the project. 



Jangan menyebutnya sebagai batas aplikasi.



28. PERFORMANCE



Prioritas:



Tidak crash



Tidak kehilangan data



Struktur benar



Editor responsif



ZIP benar



Import/export benar



Animasi



Untuk project besar:



virtualized file tree



virtualized search results



lazy rendering



lazy folder loading



IndexedDB



debounced persistence



batched database writes



Web Worker jika sesuai



chunk processing



jangan render semua file sekaligus



jangan memproses seluruh project di main thread jika tidak diperlukan



29. RESPONSIVE MOBILE



Harus nyaman di Android.



Desktop:



┌──────────────────────────────────────────┐ │ PROJECT FORGE New Save Import ZIP │ ├───────────────┬──────────────────────────┤ │ FILE EXPLORER │ CODE EDITOR │ │ │ │ │ folders/files │ code │ │ │ │ └───────────────┴──────────────────────────┘ 



Mobile:



☰ PROJECT FORGE Editor fullscreen 



Sidebar menjadi drawer.



Tombol harus touch-friendly.



Gunakan:



hamburger



bottom/toolbar actions jika diperlukan



full-screen editor



modal responsive



context menu melalui long press



30. UI DESIGN



Desain modern dengan kombinasi:



VS Code



GitHub



File Manager



Developer Tools



Gunakan:



dark mode sebagai default



light mode



rounded cards



subtle glass effect



clean typography



modern icons



spacing yang rapi



panel yang jelas



border halus



tidak terlalu banyak dekorasi



Aplikasi harus terasa seperti software profesional.



31. HEADER



Contoh:



◈ PROJECT FORGE [New] [Save] [Import] [ZIP] [Search] [Theme] 



Tambahkan status penyimpanan:



✓ Saved locally 



32. ANIMATIONS



Buat animasi lengkap tetapi tetap ringan.



Animasi untuk:



loading screen



modal



buttons



sidebar



folder expand/collapse



create



delete



rename



drag/drop



editor tabs



toast



search



ZIP progress



ZIP complete



import



theme switch



command palette



Gunakan:



CSS transitions



keyframes



transform



opacity



Framer Motion jika memang diperlukan



Jangan membuat animasi berat untuk ribuan node.



Hormati:



prefers-reduced-motion 



33. BUTTON ANIMATION



Button hover:



transform: translateY(-1px); 



Button press:



transform: scale(0.97); 



Loading:



◌ Creating... 



Success:



✓ Created 



Setelah beberapa saat kembali normal.



34. FOLDER ANIMATION



Arrow:



▸ 



menjadi:



▾ 



Saat folder dibuka, arrow melakukan rotasi.



Konten folder muncul dengan animasi ringan.



Jangan menganimasikan ribuan node sekaligus.



35. DELETE ANIMATION



Saat item dihapus:



fade



slide



scale ringan



Kemudian tampilkan:



File deleted [Undo] 



36. TOAST SYSTEM



Buat sistem toast:



✓ Success ✕ Error ⚠ Warning ⓘ Info 



Fitur:



animated



auto dismiss



close manual



tidak menumpuk berlebihan



responsive mobile



Jangan menggunakan browser alert() untuk UI normal.



37. LOADING SCREEN



Saat aplikasi pertama kali dibuka:



◈ PROJECT FORGE Preparing workspace... 



Kemudian:



✓ Workspace Ready 



Lalu masuk ke aplikasi.



Loading harus cepat dan tidak dibuat terlalu lama hanya untuk dekorasi.



38. COMMAND PALETTE



Buat command palette seperti VS Code.



Shortcut:



Ctrl + K 



atau:



Ctrl + Shift + P 



Di mobile sediakan tombol khusus.



Commands:



New Project New File New Folder Save Export ZIP Import ZIP Search Toggle Theme Expand All Collapse All 



39. THEME



Dukung:



Dark



Light



Simpan pilihan theme di browser.



Jangan menghapus project ketika theme berubah.



40. ACCESSIBILITY



Wajib:



keyboard navigation



focus indicator



ARIA labels



readable contrast



touch-friendly buttons



semantic HTML



reduced motion



editor shortcuts



mobile accessibility



41. ERROR HANDLING



Ini sangat penting.



Aplikasi tidak boleh berubah menjadi blank/white screen karena satu error.



Gunakan:



React Error Boundary



try/catch



validation



safe JSON parsing



safe ZIP parsing



IndexedDB error handling



import error handling



cloud error handling



fallback UI



Jika terjadi error besar tampilkan:



Something went wrong. Your local project data was not intentionally deleted. [Retry] [Return to Project] 



Jangan:



menghapus project



reset database



membuat project kosong



logout user



kehilangan data



karena error.



42. DATA SAFETY



Jika operasi berisiko:



buat snapshot/backup state jika diperlukan



lakukan operasi



validasi hasil



commit perubahan



jika gagal, rollback



Import ZIP/JSON harus menggunakan temporary state terlebih dahulu.



Jangan langsung menimpa project aktif sebelum import berhasil divalidasi.



43. VALIDATION



Tangani:



empty file name



empty folder name



duplicate names dalam parent



invalid paths



invalid structure



circular folder movement



corrupted IndexedDB state



corrupt JSON



corrupt ZIP



unsupported operation



storage errors



Tampilkan pesan yang mudah dimengerti manusia.



44. SECURITY & PRIVACY



Aplikasi hanya boleh:



membaca file yang dipilih user



membuat project



membuat file virtual



membuat folder virtual



edit content



menyimpan project



import



export



Jangan menjalankan kode user.



JANGAN menjalankan:



shell command



Python



Node.js



arbitrary JavaScript



executable files



Project hanya dikelola sebagai data.



Default:



Data tetap lokal di perangkat.



Cloud hanya jika user memilihnya.



45. NO GOOGLE ACCOUNT



PENTING:



Jangan membuat:



Sign in with Google Login Register Create Account Email Password 



Aplikasi harus langsung terbuka dan dapat digunakan.



Tidak ada akun yang diperlukan.



46. NO MANDATORY TEMPLATE



Jangan memaksa:



React Project Vue Project Node Project Python Project 



User harus bisa membuat:



whatever/ ├── abc.xyz ├── folder123/ ├── hello.test └── random.file 



Semua valid selama nama/path valid.



47. EXAMPLE PROJECT



Example Project boleh disediakan untuk demo.



Misalnya:



example-project/ ├── index.html ├── style.css ├── js/ │ ├── main.js │ └── player.js └── assets/ └── images/ 



Tetapi jangan menjadikan contoh ini sebagai struktur default yang wajib.



Default harus:



Blank Project



48. DESKTOP LAYOUT



Gunakan layout seperti:



┌─────────────────────────────────────────────────────────┐ │ ◈ PROJECT FORGE │ │ [New] [Save] [Import] [ZIP] [Search] [Theme] │ ├───────────────────┬─────────────────────────────────────┤ │ FILE EXPLORER │ EDITOR │ │ │ │ │ 📁 src │ index.html main.js player.js │ │ 📄 main.js │─────────────────────────────────────│ │ 📄 player.js │ 1 <!DOCTYPE html> │ │ 📁 assets │ 2 <html> │ │ 📄 index.html │ 3 ... │ │ │ │ ├───────────────────┴─────────────────────────────────────┤ │ ✓ Saved locally Files: 24 Folders: 8 Size: 2.4MB │ └─────────────────────────────────────────────────────────┘ 



49. MOBILE LAYOUT



Contoh:



┌───────────────────────┐ │ ☰ PROJECT FORGE ⋮ │ ├───────────────────────┤ │ index.html × │ ├───────────────────────┤ │ │ │ 1 <!DOCTYPE html> │ │ 2 <html> │ │ 3 ... │ │ │ ├───────────────────────┤ │ ✓ Saved locally │ └───────────────────────┘ 



Sidebar muncul melalui drawer.



50. DRAG AND DROP



Desktop:



drag file



drag folder



drop ke folder



Saat target valid:



Drop into src/ 



Saat target tidak valid:



Cannot move item here 



Jangan izinkan folder dipindahkan ke dirinya sendiri atau descendant-nya.



Mobile dapat menggunakan Move dialog sebagai alternatif jika drag/drop touch tidak nyaman.



51. SAVE BUTTON



Tombol Save harus berfungsi.



Namun autosave tetap aktif.



Save manual:



Saving... 



kemudian:



✓ Saved locally 



52. IMPORT/EXPORT SAFETY



Semua operasi import/export harus:



menunjukkan progress bila besar



menangani error



tidak freeze



tidak merusak state lama



memberi feedback



53. LARGE PROJECT HANDLING



Aplikasi harus dirancang untuk project sangat besar.



Jangan menggunakan pola seperti:



render every node 



Gunakan:



Virtualized Tree ↓ Visible Nodes Only ↓ Lazy Folder Expansion ↓ IndexedDB 



Untuk search:



Search Index ↓ Debounce ↓ Virtualized Results 



Untuk ZIP:



Project ↓ Chunk Processing ↓ Worker jika sesuai ↓ ZIP 



54. STATE RECOVERY



Jika aplikasi ditutup secara tidak sengaja:



project lokal tetap tersimpan



buka kembali → project masih ada



Jika autosave sedang berjalan dan browser tiba-tiba tertutup:



gunakan batching



gunakan safe commit



gunakan snapshot bila perlu



Tujuannya meminimalkan kehilangan data.



55. FIRST RUN



Saat pertama kali dibuka:



PROJECT FORGE Create your project. [Create Blank Project] [Open Project Library] 



Tidak meminta login.



Tidak meminta email.



Tidak meminta Google.



56. FINAL USER EXPERIENCE



User membuka website.



Tidak ada:



Login Register Google Account 



User langsung melihat Project Forge.



User bisa:



New Project ↓ Blank Project ↓ Create ↓ New Folder ↓ New File ↓ Edit Code ↓ Autosave ↓ Export ZIP 



Atau:



Generate From Structure ↓ Paste custom structure ↓ Generate ↓ Project ready 



57. TECH STACK



Gunakan stack modern yang cocok dengan Lovable.



Direkomendasikan:



React



TypeScript



Vite



Tailwind CSS



IndexedDB



Dexie jika diperlukan



Monaco Editor jika cocok



JSZip



Framer Motion jika diperlukan



Supabase hanya sebagai optional cloud



Gunakan library hanya jika benar-benar membantu.



Jangan membuat aplikasi terlalu berat tanpa alasan.



58. COMPONENT ARCHITECTURE



Pisahkan komponen secara rapi.



Contoh:



src/ ├── components/ │ ├── FileExplorer/ │ ├── CodeEditor/ │ ├── FileTabs/ │ ├── CommandPalette/ │ ├── ContextMenu/ │ ├── Modals/ │ ├── Toast/ │ ├── Progress/ │ └── Layout/ │ ├── engine/ │ ├── projectEngine.ts │ ├── tree.ts │ ├── history.ts │ ├── validation.ts │ └── statistics.ts │ ├── storage/ │ ├── indexedDB.ts │ ├── backup.ts │ └── cloud.ts │ ├── import/ │ ├── structureParser.ts │ ├── zipImporter.ts │ └── jsonImporter.ts │ ├── export/ │ ├── zipExporter.ts │ └── jsonExporter.ts │ └── pages/ 



Sesuaikan struktur jika Lovable menghasilkan arsitektur yang lebih baik.



59. IMPORTANT IMPLEMENTATION RULE



Jangan membuat fitur palsu seperti:



Button exists but does nothing 



Semua tombol utama harus mempunyai aksi nyata.



Jangan hanya membuat UI prototype.



Implementasikan logic sebenarnya untuk:



project



file



folder



editor



autosave



IndexedDB



import



export



ZIP



search



undo



redo



drag/drop



context menu



statistics



theme



error handling



60. ACCEPTANCE TEST



Pastikan semua ini berhasil.



Project



Create project



Rename project



Delete project



Duplicate project



Folder



Create folder



Rename folder



Delete folder



Move folder



Duplicate folder



Deep nesting



File



Create file



Rename file



Delete file



Move file



Duplicate file



Edit file



Download file



Editor



Multiple tabs



Syntax highlighting



Line numbers



Autosave



Undo



Redo



Search



Replace



Ctrl+S



Structure



Custom tree parser



Arbitrary extensions



Files without extensions



Deep nesting



Spaces/special characters where valid



No artificial file/folder limit



Storage



IndexedDB



Refresh persistence



Browser reopen persistence



Offline support



Project Library



Import/Export



ZIP export



ZIP import



JSON backup



JSON restore



Single file download



Progress UI



Error-safe import



Cloud



Optional only



Never required



Local data remains safe if cloud fails



No Google account



UI



Dark mode



Light mode



Desktop responsive



Android responsive



Tablet responsive



Animations



Toast



Modal



Loading screen



Error boundary



Accessibility



Reduced motion



Authentication



NO Google Login



NO Sign Up



NO Register



NO email/password



NO mandatory account



App works immediately



61. FINAL REQUIREMENT



Hasil akhir harus terasa seperti gabungan:



VS Code + File Explorer + Project Generator + ZIP Builder



tetapi berjalan langsung di browser dan bisa digunakan tanpa akun.



User harus dapat:



menentukan sendiri struktur project



membuat folder



membuat file



mengedit kode



menyimpan project



membuka kembali project



mencari file



memindahkan file/folder



rename



duplicate



delete



undo/redo



import ZIP



export ZIP



backup JSON



restore JSON



menggunakan aplikasi offline



menggunakan aplikasi di Android



menggunakan aplikasi di desktop



Tanpa:



Google Login



akun



register



password



struktur wajib



template wajib



batas file buatan



batas folder buatan



upload cloud otomatis



Prioritas utama:



FUNCTIONALITY → DATA SAFETY → PERFORMANCE → RESPONSIVENESS → UI → ANIMATION



Jangan mengorbankan keamanan data dan stabilitas hanya demi animasi.



Jika ada error:



JANGAN blank screen.



Jika cloud gagal:



JANGAN hapus local project.



Jika ZIP gagal:



JANGAN rusak project aktif.



Jika import gagal:



JANGAN overwrite project lama.



Jika project sangat besar:



optimalkan rendering dan processing, jangan memberikan artificial limit.



Buat PROJECT FORGE sebagai aplikasi nyata yang siap digunakan, bukan sekadar demonstrasi UI.



TAGLINE



YOUR PROJECT. YOUR STRUCTURE. YOUR RULES.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://nuxe.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/246cd81f-43c6-48f7-9355-b289a2f78e06).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
