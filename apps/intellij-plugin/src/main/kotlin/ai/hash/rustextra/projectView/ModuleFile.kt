package ai.hash.rustextra.projectView

import com.intellij.lang.FileASTNode
import com.intellij.lang.Language
import com.intellij.navigation.ItemPresentation
import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.TextRange
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.*
import com.intellij.psi.scope.PsiScopeProcessor
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.psi.search.PsiElementProcessor
import com.intellij.psi.search.SearchScope
import javax.swing.Icon

class ModuleFile(private val file: PsiFile, private val directory: PsiDirectory): PsiFile, PsiDirectory {
    override fun <T : Any?> getUserData(key: Key<T>): T? {
        println("getUserData() $key");
        return file.getUserData(key)
    }

    override fun <T : Any?> putUserData(key: Key<T>, value: T?) {
        println("putUserData() $key, $value");
        return file.putUserData(key, value)
    }

    override fun getIcon(flags: Int): Icon {
        println("getIcon() $flags")
        return file.getIcon(flags)
    }

    override fun getProject(): Project {
        println("getProject()")
        return file.project
    }

    override fun getLanguage(): Language {
        println("getLanguage()")
        return file.language
    }

    override fun getManager(): PsiManager {
        println("getManager()")
        return file.manager
    }

    override fun getChildren(): Array<PsiElement> {
        println("getChildren()")
        return directory.children
    }

    override fun getParent(): PsiDirectory? {
        println("getParent()")
        return file.parent
    }

    override fun getFirstChild(): PsiElement {
        println("getFirstChild()")
        return directory.firstChild
    }

    override fun getLastChild(): PsiElement {
        println("getLastChild()")
        return directory.lastChild
    }

    override fun getNextSibling(): PsiElement {
        println("getNextSibling()")
        val sibling = file.nextSibling;

        return if (sibling == directory) {
            directory.nextSibling
        } else {
            sibling
        }
    }

    override fun getPrevSibling(): PsiElement {
        println("getPrevSibling()")
        val sibling = file.prevSibling;

        return if (sibling == directory) {
            directory.prevSibling
        } else {
            sibling
        }
    }

    override fun getContainingFile(): PsiFile {
        println("getContainingFile()")
        return file.containingFile
    }

    override fun getTextRange(): TextRange {
        println("getTextRange()")
        return file.textRange
    }

    override fun getStartOffsetInParent(): Int {
        println("getStartOffsetInParent()")
        return file.startOffsetInParent
    }

    override fun getTextLength(): Int {
        println("getTextLength()")
        return file.textLength
    }

    override fun findElementAt(offset: Int): PsiElement? {
        println("findElementAt() $offset")
        return directory.findElementAt(offset)
    }

    override fun findReferenceAt(offset: Int): PsiReference? {
        println("findReferenceAt() $offset")
        return directory.findReferenceAt(offset)
    }

    override fun getTextOffset(): Int {
        println("getTextOffset()")
        return file.textOffset
    }

    override fun getText(): String {
        println("getText()")
        return file.text
    }

    override fun textToCharArray(): CharArray {
        println("textToCharArray()")
        return file.textToCharArray()
    }

    override fun getNavigationElement(): PsiElement {
        println("getNavigationElement()")
        return file.navigationElement
    }

    override fun getOriginalElement(): PsiElement {
        println("getOriginalElement()")
        return file.originalElement
    }

    override fun textMatches(text: CharSequence): Boolean {
        println("textMatches()")
        return file.textMatches(text)
    }

    override fun textMatches(element: PsiElement): Boolean {
        println("textMatches()")
        return file.textMatches(text)
    }

    override fun textContains(c: Char): Boolean {
        println("textContains() $c")
        return file.textContains(c)
    }

    override fun accept(visitor: PsiElementVisitor) {
        println("accept() $visitor")
        return file.accept(visitor)
    }

    override fun acceptChildren(visitor: PsiElementVisitor) {
        println("acceptChildren() $visitor")
        return directory.acceptChildren(visitor)
    }

    override fun copy(): PsiElement {
        println("copy()")
        return ModuleFile(file.copy() as PsiFile, directory.copy() as PsiDirectory)
    }

    override fun add(element: PsiElement): PsiElement {
        println("add() $element")
        return directory.add(element)
    }

    override fun addBefore(element: PsiElement, anchor: PsiElement?): PsiElement {
        println("addBefore() $element $anchor")
        return directory.addBefore(element, anchor)
    }

    override fun addAfter(element: PsiElement, anchor: PsiElement?): PsiElement {
        println("addAfter() $element, $anchor")
        return directory.addAfter(element, anchor)
    }

    override fun checkAdd(element: PsiElement) {
        println("checkAdd() $element")
        return directory.checkAdd(element)
    }

    override fun addRange(first: PsiElement?, last: PsiElement?): PsiElement {
        println("addRange() $first $last")
        return directory.addRange(first, last)
    }

    override fun addRangeBefore(first: PsiElement, last: PsiElement, anchor: PsiElement?): PsiElement {
        println("addRangeBefore() $first $last $anchor")
        return directory.addRangeBefore(first, last, anchor)
    }

    override fun addRangeAfter(first: PsiElement?, last: PsiElement?, anchor: PsiElement?): PsiElement {
        println("addRangeAfter() $first $last $anchor")
        return directory.addRangeAfter(first, last, anchor)
    }

    override fun delete() {
        println("delete()")
        directory.delete();
        file.delete();
    }

    override fun checkDelete() {
        println("checkDelete()")
        directory.checkDelete();
        file.checkDelete();
    }

    override fun deleteChildRange(first: PsiElement?, last: PsiElement?) {
        println("deleteChildRange() $first $last")
        directory.deleteChildRange(first, last)
    }

    override fun replace(newElement: PsiElement): PsiElement {
        println("replace() $newElement")
        directory.delete();
        return file.replace(newElement)
    }

    override fun isValid(): Boolean {
        println("isValid()")
        return directory.isValid && file.isValid
    }

    override fun isWritable(): Boolean {
        println("isWritable()")
        return file.isWritable
    }

    override fun getReference(): PsiReference? {
        println("getReference()")
        return file.reference
    }

    override fun getReferences(): Array<PsiReference> {
        println("getReferences()")
        return file.references
    }

    override fun <T : Any?> getCopyableUserData(key: Key<T>): T? {
        println("getCopyableUserData()")
        return file.getCopyableUserData(key)
    }

    override fun <T : Any?> putCopyableUserData(key: Key<T>, value: T?) {
        println("putCopyableUserData()")
        return file.putCopyableUserData(key, value)
    }

    override fun processDeclarations(
        processor: PsiScopeProcessor,
        state: ResolveState,
        lastParent: PsiElement?,
        place: PsiElement
    ): Boolean {
        println("processDeclarations()")
        return file.processDeclarations(processor, state, lastParent, place)
    }

    override fun getContext(): PsiElement? {
        println("getContext()")
        return file.context
    }

    override fun isPhysical(): Boolean {
        println("isPhysical()")
        return file.isPhysical
    }

    override fun getResolveScope(): GlobalSearchScope {
        println("getResolveScope()")
        return file.resolveScope
    }

    override fun getUseScope(): SearchScope {
        println("getUserScope()")
        return file.useScope
    }

    override fun getNode(): FileASTNode {
        println("getNode()")
        return file.node
    }

    override fun isEquivalentTo(another: PsiElement?): Boolean {
        println("isEquivalentTo() $another")
        return file.isEquivalentTo(another)
    }

    override fun getName(): String {
        println("getName()")
        return file.name
    }

    private fun determineName(name: String): Pair<String, String> {
        val bareName = name.removeSuffix(".rs");
        val fileName = "${bareName}.rs";

        return Pair(bareName, fileName);
    }

    override fun setName(name: String): PsiElement {
        val (directoryName, fileName) = determineName(name);

        return ModuleFile(file.setName(fileName) as PsiFile, directory.setName(directoryName) as PsiDirectory)
    }

    override fun checkSetName(name: String?) {
        if (name != null) {
            val (directoryName, fileName) = determineName(name);

            file.checkSetName(fileName);
            directory.checkSetName(directoryName);
        } else {
            file.checkSetName(null);
            directory.checkSetName(null);
        }
    }

    override fun navigate(requestFocus: Boolean) {
        return file.navigate(requestFocus)
    }

    override fun canNavigate(): Boolean {
        return file.canNavigate()
    }

    override fun canNavigateToSource(): Boolean {
        return file.canNavigateToSource()
    }

    override fun getPresentation(): ItemPresentation? {
        return file.presentation
    }

    override fun isDirectory(): Boolean {
        return true
    }

    override fun getVirtualFile(): VirtualFile {
        return file.virtualFile
    }

    override fun processChildren(processor: PsiElementProcessor<in PsiFileSystemItem>): Boolean {
        return directory.processChildren(processor)
    }

    override fun getParentDirectory(): PsiDirectory? {
        return directory.parentDirectory
    }

    override fun getSubdirectories(): Array<PsiDirectory> {
        return directory.subdirectories
    }

    override fun getFiles(): Array<PsiFile> {
        return directory.files
    }

    override fun findSubdirectory(name: String): PsiDirectory? {
        return directory.findSubdirectory(name)
    }

    override fun findFile(name: String): PsiFile? {
        return directory.findFile(name)
    }

    override fun createSubdirectory(name: String): PsiDirectory {
        return directory.createSubdirectory(name)
    }

    override fun checkCreateSubdirectory(name: String) {
        return directory.checkCreateSubdirectory(name)
    }

    override fun createFile(name: String): PsiFile {
        return directory.createFile(name)
    }

    override fun copyFileFrom(newName: String, originalFile: PsiFile): PsiFile {
        return directory.copyFileFrom(newName, originalFile)
    }

    override fun checkCreateFile(name: String) {
        return directory.checkCreateFile(name)
    }

    override fun getContainingDirectory(): PsiDirectory {
        return file.containingDirectory
    }

    override fun getModificationStamp(): Long {
        return file.modificationStamp
    }

    override fun getOriginalFile(): PsiFile {
        return file.originalFile
    }

    override fun getFileType(): FileType {
        return file.fileType
    }

    override fun getPsiRoots(): Array<PsiFile> {
        return file.psiRoots
    }

    override fun getViewProvider(): FileViewProvider {
        return file.viewProvider
    }

    override fun subtreeChanged() {
        file.subtreeChanged();
    }
}