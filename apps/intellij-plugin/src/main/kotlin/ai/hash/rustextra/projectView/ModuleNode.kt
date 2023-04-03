package ai.hash.rustextra.projectView

import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiDirectory
import com.intellij.psi.PsiFile

class ModuleNode(
    project: Project,
    value: ModuleFile,
    viewSettings: ViewSettings?,
    private val children: Collection<AbstractTreeNode<*>>,
) :
    PsiFileNode(project, value, viewSettings) {



    override fun getChildrenImpl(): Collection<AbstractTreeNode<*>> = children

    override fun contains(file: VirtualFile): Boolean = children.any { child ->
        val value = child.value

        if (value is PsiFile) {
            value.virtualFile.equals(file)
        } else {
            false
        }
    }

    override fun expandOnDoubleClick(): Boolean = true

    companion object {
        fun fromPsiFileNode(node: AbstractTreeNode<PsiFile>, settings: ViewSettings?, children: Collection<AbstractTreeNode<*>>, directory: PsiDirectory) =
            ModuleNode(node.project, ModuleFile(node.value, directory), settings, children)
    }
}
